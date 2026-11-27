import { useEffect, useState } from 'react';
import { number } from './api';
import { Field } from './ui';

type Values = Record<string, any>;
type Props = { form: Values; onChange: (values: Values) => void; disabled?: boolean };
const utilities = [
  { key: 'electric', label: 'điện', title: 'Điện', unit: 'kWh' },
  { key: 'water', label: 'nước', title: 'Nước', unit: 'm³' },
];
const numeric = (value: unknown): number | null => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);

/** An explicit entry calculator; the owner still verifies the final meter values. */
export function MeterReadingEntry({ form, onChange, disabled = false }: Props) {
  const [mode, setMode] = useState('cumulative');
  useEffect(() => { setMode('cumulative'); }, [form.roomId, form.period]);
  const consumption = mode === 'consumption';
  const segments=(key:string)=>(form.meterBreakdown||[]).filter((s:Values)=>s.utility===key);
  const opening=(key:string)=>numeric(segments(key).at(-1)?.newOpening??form[key+'Old']);
  const priorUsage=(key:string)=>segments(key).reduce((sum:number,s:Values)=>sum+Number(s.oldClosing)-Number(s.oldOpening),0);
  function changeMode(next: string) {
    const values: Values = {};
    if (next === 'consumption') {
      for (const { key } of utilities) {
        const start = opening(key), end = numeric(form[key + 'New']);
        // An invalid, unsaved decrease is not silently reinterpreted as usage.
        values[key + 'New'] = start === null ? '' : end !== null && end >= start ? end : start;
      }
    }
    setMode(next); onChange(values);
  }
  function usage(key: string) {
    const start = opening(key), end = numeric(form[key + 'New']);
    return start === null || end === null ? '' : priorUsage(key) + end - start;
  }
  function changeUsage(key: string, raw: string) {
    const start = opening(key);
    onChange({ [key + 'New']: raw === '' || start === null ? '' : start + Number(raw) - priorUsage(key) });
  }
  const startFields = utilities.map(({ key, label, unit }) => <Field key={key + '-start'} label={`Chỉ số ${label} đầu kỳ (${unit})`} type="number" min={0} step="any" required readOnly={consumption||segments(key).length>0} disabled={disabled} value={opening(key)??''} onChange={event => onChange({ [key + 'Old']: event.target.value === '' ? '' : Number(event.target.value) })}/>);
  const endFields = utilities.map(({ key, label, unit }) => <Field key={key + '-end'} label={`Chỉ số ${label} cuối kỳ${consumption ? ' được tính' : ''} (${unit})`} type="number" min={0} step="any" required readOnly={consumption} disabled={disabled} value={form[key + 'New'] ?? 0} onChange={event => onChange({ [key + 'New']: event.target.value === '' ? '' : Number(event.target.value) })}/>);
  return <div className="field-full form-grid meter-reading-entry">
    <Field label="Cách nhập điện nước" type="select" full value={mode} disabled={disabled} onChange={event => changeMode(event.target.value)} options={[{ value: 'cumulative', label: 'Chỉ số trên công tơ' }, { value: 'consumption', label: 'Lượng tiêu thụ kỳ này' }]}/>
    <p className="form-note field-full">{form.meterBreakdown?.length?'Tổng lượng dùng trong kỳ bao gồm phần trước và sau mỗi lần thay công tơ.':consumption
      ? 'Nhập lượng đã dùng trong kỳ; lượng dùng có thể ít hơn tháng trước. Chỉ số cuối kỳ bên dưới được tính bằng đầu kỳ + lượng dùng. Đầu kỳ vẫn phải là số tích lũy đã chốt trên công tơ.'
      : 'Nhập số tích lũy trên công tơ ở đầu kỳ và cuối kỳ. Lượng dùng trong kỳ = cuối kỳ − đầu kỳ. Nếu có số điện, nước đã dùng trong tháng, chọn “Lượng tiêu thụ kỳ này”.'}</p>
    {utilities.map(({key,title,unit})=>segments(key).length>0&&<p key={key} className="form-note field-full">{title} đã dùng trước khi thay công tơ: {number(priorUsage(key))} {unit}. Chỉ số cuối trên công tơ hiện tại bằng chỉ số lắp đặt cộng phần tiêu thụ sau khi thay.</p>)}
    {consumption ? <>
      {utilities.map(({ key, title, unit }) => <Field key={key + '-usage'} label={`${title} tiêu thụ kỳ này (${unit})`} type="number" min={priorUsage(key)} step="any" required disabled={disabled} value={usage(key)} onChange={event => changeUsage(key, event.target.value)}/>)}
      {startFields}{endFields}
      <p className="form-note field-full">Đối chiếu chỉ số cuối kỳ được tính với công tơ và ảnh minh chứng trước khi xác nhận lưu.</p>
    </> : <>
      {startFields[0]}{endFields[0]}{startFields[1]}{endFields[1]}
      <p className="form-note field-full" role="status">{utilities.map(({ key, title, unit }) => {
        const value = usage(key);
        return <span className="block" key={key}>{title} tiêu thụ kỳ này: {value === '' || value < 0 ? 'Kiểm tra lại chỉ số đầu kỳ / cuối kỳ' : `${number(value)} ${unit}`}</span>;
      })}</p>
    </>}
  </div>;
}
