import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Spinner } from './components/ui';
import '@fontsource/baloo-2/600.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import './card.css';

const StudentApp = lazy(() => import('./student/StudentApp'));
const TeacherApp = lazy(() => import('./teacher/TeacherApp'));
const Listen = lazy(() => import('./pages/Listen'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<StudentApp />} />
          <Route path="/teacher/*" element={<TeacherApp />} />
          <Route path="/listen/:token" element={<Listen />} />
          <Route path="*" element={<StudentApp />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
