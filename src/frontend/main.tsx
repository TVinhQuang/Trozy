import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './ai.css';
class ErrorBoundary extends Component<{children:ReactNode},{error:string}>{state={error:''};static getDerivedStateFromError(error:Error){return {error:error.message};}render(){return this.state.error?<div className="app-loading"><h2>Trang đang gặp sự cố</h2><p>Vui lòng tải lại để tiếp tục.</p><button className="btn btn-primary" onClick={()=>location.reload()}>Tải lại trang</button></div>:this.props.children;}}
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>);
