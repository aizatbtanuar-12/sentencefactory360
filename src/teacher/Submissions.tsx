import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Status, type Submission } from '../api';
import { Spinner, StatusBadge } from '../components/ui';
import { formatDate } from '../lib/hooks';
import { ReviewModal } from './ReviewModal';

const FILTERS: [Status | '', string][] = [
  ['', 'All'],
  ['pending', 'Pending'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
];

export function Submissions() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as Status | '';
  const cls = params.get('class') ?? '';
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [allClasses, setAllClasses] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await api.teacher.list({ status, class_name: cls }));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [status, cls]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  useEffect(() => {
    api.teacher.getSettings().then((s) => setAllClasses(s.classes.map((c) => c.name))).catch(() => undefined);
  }, []);

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const shown = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => !q || r.pupil_name.toLowerCase().includes(q.toLowerCase()) || r.sentence.toLowerCase().includes(q.toLowerCase()),
      ),
    [rows, q],
  );

  return (
    <div>
      <h1 className="page-title">Submissions</h1>
      <div className="toolbar">
        <div className="segmented" role="tablist">
          {FILTERS.map(([v, label]) => (
            <button key={label} role="tab" aria-selected={status === v} className={status === v ? 'active' : ''} onClick={() => set('status', v)}>
              {label}
            </button>
          ))}
        </div>
        <select value={cls} onChange={(e) => set('class', e.target.value)} className="select" aria-label="Class">
          <option value="">All classes</option>
          {allClasses.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input className="input" placeholder="🔍 Search name or sentence" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-ghost" onClick={load}>
          ↻ Refresh
        </button>
      </div>
      {error && <p className="error-msg">{error}</p>}
      {!rows && !error && <Spinner />}
      {rows && shown.length === 0 && <p className="muted">No submissions here yet.</p>}
      {rows && shown.length > 0 && (
        <div className="table-wrap">
          <table className="sub-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>Sentence</th>
                <th>Submitted</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} onClick={() => setOpen(r.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(r.id)}>
                  <td className="strong">{r.pupil_name}</td>
                  <td>{r.class_name}</td>
                  <td className="sentence-cell">{r.sentence}</td>
                  <td className="nowrap">{formatDate(r.created_at)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <ReviewModal id={open} queue={shown.map((r) => r.id)} onOpen={setOpen} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
