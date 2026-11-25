"""Lossless ONNX <-> PyTorch trainable module bridge for PP-OCRv6 det and rec.

Loads an official PaddleOCR ONNX graph into an exact PyTorch nn.Module without
changing graph topology, dynamic dimensions, or operator semantics, and writes
fine-tuned float32 initializer weights back into the original ONNX ModelProto.
"""
from __future__ import annotations

from pathlib import Path
import re

import numpy as np
import onnx
from onnx import numpy_helper
import torch
import torch.nn as nn
import torch.nn.functional as F


def _safe_name(onnx_name: str) -> str:
    return re.sub(r'[^0-9a-zA-Z_]', '__', onnx_name)


def _pad_same_upper_2d(x: torch.Tensor, kernel_shape: list[int], strides: list[int], pad_value: float = 0.0) -> torch.Tensor:
    _, _, h, w = x.shape
    kh, kw = kernel_shape
    sh, sw = strides
    out_h = (h + sh - 1) // sh
    out_w = (w + sw - 1) // sw
    pad_h = max((out_h - 1) * sh + kh - h, 0)
    pad_w = max((out_w - 1) * sw + kw - w, 0)
    pad_top = pad_h // 2
    pad_bottom = pad_h - pad_top
    pad_left = pad_w // 2
    pad_right = pad_w - pad_left
    if pad_top == 0 and pad_bottom == 0 and pad_left == 0 and pad_right == 0:
        return x
    return F.pad(x, (pad_left, pad_right, pad_top, pad_bottom), mode='constant', value=pad_value)


class OnnxTrainableModule(nn.Module):
    """Executes an ONNX graph in PyTorch with trainable float32 weights."""

    def __init__(self, onnx_path: str | Path) -> None:
        super().__init__()
        self.onnx_path = Path(onnx_path)
        self.proto = onnx.load(str(self.onnx_path))

        # Determine which initializers are true learnable parameters vs constants/running-stats
        non_trainable: set[str] = set()
        trainable_candidates: set[str] = set()
        for node in self.proto.graph.node:
            op = node.op_type
            ins = list(node.input)
            if op in ('Conv', 'ConvTranspose'):
                for name in ins[1:]:
                    if name:
                        trainable_candidates.add(name)
            elif op == 'BatchNormalization':
                # scale and bias are trainable; running_mean and running_var stay frozen buffers
                if len(ins) >= 3:
                    trainable_candidates.add(ins[1])
                    trainable_candidates.add(ins[2])
                for name in ins[3:]:
                    non_trainable.add(name)
            elif op == 'MatMul':
                for name in ins:
                    trainable_candidates.add(name)
            elif op in ('Resize', 'Slice', 'Reshape', 'Pow'):
                for name in ins[1:]:
                    non_trainable.add(name)

        self.name_map: dict[str, tuple[str, bool]] = {}
        self.nodes = []
        for idx, init in enumerate(self.proto.graph.initializer):
            arr = numpy_helper.to_array(init).copy()
            safe = f"init_{idx}_{_safe_name(init.name)}"
            is_float = arr.dtype == np.float32
            # Multi-element Add/Mul float32 tensors (biases, layer-norm scales) are also trainable
            is_param = is_float and (
                init.name in trainable_candidates or (arr.size > 1 and init.name not in non_trainable)
            )
            tensor = torch.from_numpy(arr)
            if is_param:
                self.register_parameter(safe, nn.Parameter(tensor))
            else:
                self.register_buffer(safe, tensor)
            self.name_map[init.name] = (safe, is_param)

        for node in self.proto.graph.node:
            attrs = {a.name: onnx.helper.get_attribute_value(a) for a in node.attribute}
            self.nodes.append((node.op_type, list(node.input), list(node.output), attrs))

        self.input_name = self.proto.graph.input[0].name
        self.output_name = self.proto.graph.output[0].name
        # Pre-activation logit tensor right before final Sigmoid (det) or Softmax (rec)
        last_op, last_in, last_out, _ = self.nodes[-1]
        self.logit_name = last_in[0] if last_op in ('Sigmoid', 'Softmax') and last_out[0] == self.output_name else None

    def _get_tensor(self, env: dict[str, torch.Tensor], name: str) -> torch.Tensor:
        if name in env:
            return env[name]
        safe, is_param = self.name_map[name]
        return getattr(self, safe)

    def forward(self, x: torch.Tensor, return_logits: bool = False):
        env: dict[str, torch.Tensor] = {self.input_name: x}
        for op, ins, outs, attrs in self.nodes:
            if op == 'Conv':
                inp = self._get_tensor(env, ins[0])
                w = self._get_tensor(env, ins[1])
                b = self._get_tensor(env, ins[2]) if len(ins) > 2 and ins[2] else None
                strides = attrs.get('strides', [1, 1])
                dilations = attrs.get('dilations', [1, 1])
                group = int(attrs.get('group', 1))
                auto_pad = attrs.get('auto_pad', b'')
                if auto_pad == b'SAME_UPPER':
                    inp = _pad_same_upper_2d(inp, attrs['kernel_shape'], strides, 0.0)
                    pad = (0, 0)
                else:
                    pads = attrs.get('pads', [0, 0, 0, 0])
                    if pads[0] == pads[2] and pads[1] == pads[3]:
                        pad = (pads[0], pads[1])
                    else:
                        inp = F.pad(inp, (pads[1], pads[3], pads[0], pads[2]))
                        pad = (0, 0)
                out = F.conv2d(inp, w, b, stride=strides, padding=pad, dilation=dilations, groups=group)
            elif op == 'ConvTranspose':
                inp = self._get_tensor(env, ins[0])
                w = self._get_tensor(env, ins[1])
                b = self._get_tensor(env, ins[2]) if len(ins) > 2 and ins[2] else None
                strides = attrs.get('strides', [1, 1])
                dilations = attrs.get('dilations', [1, 1])
                group = int(attrs.get('group', 1))
                pads = attrs.get('pads', [0, 0, 0, 0])
                out = F.conv_transpose2d(inp, w, b, stride=strides, padding=(pads[0], pads[1]), dilation=dilations, groups=group)
            elif op == 'BatchNormalization':
                inp = self._get_tensor(env, ins[0])
                scale = self._get_tensor(env, ins[1])
                bias = self._get_tensor(env, ins[2])
                mean = self._get_tensor(env, ins[3])
                var = self._get_tensor(env, ins[4])
                eps = float(attrs.get('epsilon', 1e-5))
                out = F.batch_norm(inp, mean, var, scale, bias, training=False, eps=eps)
            elif op == 'Relu':
                out = F.relu(self._get_tensor(env, ins[0]))
            elif op == 'Sigmoid':
                out = torch.sigmoid(self._get_tensor(env, ins[0]))
            elif op == 'HardSigmoid':
                inp = self._get_tensor(env, ins[0])
                alpha = float(attrs.get('alpha', 0.2))
                beta = float(attrs.get('beta', 0.5))
                out = torch.clamp(inp * alpha + beta, 0.0, 1.0)
            elif op == 'Erf':
                out = torch.erf(self._get_tensor(env, ins[0]))
            elif op == 'Add':
                out = self._get_tensor(env, ins[0]) + self._get_tensor(env, ins[1])
            elif op == 'Sub':
                out = self._get_tensor(env, ins[0]) - self._get_tensor(env, ins[1])
            elif op == 'Mul':
                out = self._get_tensor(env, ins[0]) * self._get_tensor(env, ins[1])
            elif op == 'Div':
                a = self._get_tensor(env, ins[0])
                b = self._get_tensor(env, ins[1])
                if not a.is_floating_point() and not b.is_floating_point():
                    out = torch.div(a, b, rounding_mode='trunc')
                else:
                    out = a / b
            elif op == 'Pow':
                out = torch.pow(self._get_tensor(env, ins[0]), self._get_tensor(env, ins[1]))
            elif op == 'Sqrt':
                out = torch.sqrt(self._get_tensor(env, ins[0]))
            elif op == 'MatMul':
                out = torch.matmul(self._get_tensor(env, ins[0]), self._get_tensor(env, ins[1]))
            elif op == 'Softmax':
                axis = int(attrs.get('axis', -1))
                out = F.softmax(self._get_tensor(env, ins[0]), dim=axis)
            elif op == 'MaxPool':
                inp = self._get_tensor(env, ins[0])
                k = attrs['kernel_shape']
                s = attrs.get('strides', [1, 1])
                auto_pad = attrs.get('auto_pad', b'')
                if auto_pad == b'SAME_UPPER':
                    inp = _pad_same_upper_2d(inp, k, s, float('-inf'))
                    pad = (0, 0)
                else:
                    pads = attrs.get('pads', [0, 0, 0, 0])
                    pad = (pads[0], pads[1])
                out = F.max_pool2d(inp, kernel_size=k, stride=s, padding=pad, ceil_mode=bool(attrs.get('ceil_mode', 0)))
            elif op == 'AveragePool':
                inp = self._get_tensor(env, ins[0])
                k = attrs['kernel_shape']
                s = attrs.get('strides', [1, 1])
                pads = attrs.get('pads', [0, 0, 0, 0])
                cip = bool(attrs.get('count_include_pad', 0))
                out = F.avg_pool2d(inp, kernel_size=k, stride=s, padding=(pads[0], pads[1]), ceil_mode=bool(attrs.get('ceil_mode', 0)), count_include_pad=cip)
            elif op == 'GlobalAveragePool':
                out = self._get_tensor(env, ins[0]).mean(dim=(-2, -1), keepdim=True)
            elif op == 'ReduceMean':
                inp = self._get_tensor(env, ins[0])
                axes = tuple(int(a) for a in attrs['axes'])
                keepdim = bool(attrs.get('keepdims', 1))
                out = inp.mean(dim=axes, keepdim=keepdim)
            elif op == 'Concat':
                axis = int(attrs['axis'])
                out = torch.cat([self._get_tensor(env, name) for name in ins], dim=axis)
            elif op == 'Resize':
                inp = self._get_tensor(env, ins[0])
                scales = self._get_tensor(env, ins[2]).detach().cpu().tolist()
                mode = attrs.get('mode', b'nearest').decode('utf-8')
                out = F.interpolate(inp, scale_factor=(float(scales[2]), float(scales[3])), mode=mode)
            elif op == 'Identity':
                out = self._get_tensor(env, ins[0])
            elif op == 'Shape':
                inp = self._get_tensor(env, ins[0])
                out = torch.tensor(list(inp.shape), dtype=torch.int64, device=inp.device)
            elif op == 'Slice':
                data = self._get_tensor(env, ins[0])
                starts = self._get_tensor(env, ins[1]).detach().cpu().tolist()
                ends = self._get_tensor(env, ins[2]).detach().cpu().tolist()
                axes = self._get_tensor(env, ins[3]).detach().cpu().tolist() if len(ins) > 3 and ins[3] else list(range(len(starts)))
                steps = self._get_tensor(env, ins[4]).detach().cpu().tolist() if len(ins) > 4 and ins[4] else [1] * len(starts)
                slices = [slice(None)] * data.ndim
                for st, en, ax, sp in zip(starts, ends, axes, steps):
                    ax_i = int(ax) if int(ax) >= 0 else data.ndim + int(ax)
                    dim_len = data.shape[ax_i]
                    st_i = max(min(int(st) if int(st) >= 0 else dim_len + int(st), dim_len), 0)
                    en_i = max(min(int(en) if int(en) >= 0 else dim_len + int(en), dim_len), 0)
                    slices[ax_i] = slice(st_i, en_i, int(sp))
                out = data[tuple(slices)]
            elif op == 'Squeeze':
                inp = self._get_tensor(env, ins[0])
                axes = sorted([int(a) if int(a) >= 0 else inp.ndim + int(a) for a in attrs['axes']], reverse=True)
                out = inp
                for ax in axes:
                    out = out.squeeze(ax)
            elif op == 'Unsqueeze':
                inp = self._get_tensor(env, ins[0])
                axes = sorted([int(a) for a in attrs['axes']])
                out = inp
                for ax in axes:
                    out = out.unsqueeze(ax)
            elif op == 'Reshape':
                inp = self._get_tensor(env, ins[0])
                shape_raw = [int(v) for v in self._get_tensor(env, ins[1]).detach().cpu().tolist()]
                new_shape = [inp.shape[i] if v == 0 else v for i, v in enumerate(shape_raw)]
                out = inp.reshape(new_shape)
            elif op == 'Transpose':
                inp = self._get_tensor(env, ins[0])
                perm = [int(p) for p in attrs['perm']]
                out = inp.permute(*perm).contiguous()
            else:
                raise NotImplementedError(f"Unsupported ONNX op: {op}")
            env[outs[0]] = out

        probs = env[self.output_name]
        if return_logits and self.logit_name is not None:
            return probs, env[self.logit_name]
        return probs

    def export_onnx(self, dst_path: str | Path) -> Path:
        """Write updated trainable weights back into a fresh copy of the ONNX ModelProto."""
        dst = Path(dst_path)
        dst.parent.mkdir(parents=True, exist_ok=True)
        out_proto = onnx.ModelProto()
        out_proto.CopyFrom(self.proto)
        for init in out_proto.graph.initializer:
            safe, is_param = self.name_map[init.name]
            if is_param:
                arr = getattr(self, safe).detach().cpu().to(torch.float32).numpy()
                new_tensor = numpy_helper.from_array(arr, name=init.name)
                init.CopyFrom(new_tensor)
        onnx.checker.check_model(out_proto)
        onnx.save(out_proto, str(dst))
        return dst
