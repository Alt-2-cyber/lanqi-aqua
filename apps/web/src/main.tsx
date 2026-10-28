import { createRoot } from 'react-dom/client';
import { AppProvider } from './state/AppContext';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<AppProvider><App /></AppProvider>);
