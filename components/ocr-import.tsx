'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, Check, FileImage, Images, LoaderCircle, RotateCcw, ScanLine, ShieldCheck, Trash2, Video, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { categoriesFor, currencySymbol, localDate, parseAmount, validateTransaction, type Currency, type Role, type Transaction } from '@/lib/finance';
import { parseOcrText, type OcrDraft, type OcrMode } from '@/lib/ocr';

type ReviewDraft = Omit<OcrDraft, 'amountCents'> & { id: string; selected: boolean; amount: string };
type OcrWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const message = (error: unknown) => error instanceof Error ? error.message : 'The image could not be read. Try a clearer photo.';

async function readableImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(2400 / longest, Math.max(1, 1400 / longest));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser could not prepare the image.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grey = pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114;
    const contrast = Math.max(0, Math.min(255, (grey - 128) * 1.18 + 128));
    pixels.data[i] = contrast; pixels.data[i + 1] = contrast; pixels.data[i + 2] = contrast;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export function OcrImport({ currency, existingCategories, disabled, onImport }: { currency: Currency; existingCategories: string[]; disabled?: boolean; onImport: (transactions: Transaction[]) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [mode, setMode] = useState<OcrMode>('auto');
  const [detected, setDetected] = useState<'receipt' | 'transactions' | null>(null);
  const [drafts, setDrafts] = useState<ReviewDraft[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const activeWorker = useRef<OcrWorker | null>(null);

  const suggestions = useMemo(() => [...new Set([...existingCategories, ...categoriesFor('expense'), ...categoriesFor('income')])].sort(), [existingCategories]);
  const selected = drafts.filter(draft => draft.selected).length;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); stream.current?.getTracks().forEach(track => track.stop()); void activeWorker.current?.terminate(); }, [preview]);

  function choose(next?: File) {
    if (!next) return;
    setError(''); setDrafts([]); setDetected(null); setProgress(0); setStatus('');
    if (!next.type.startsWith('image/')) { setError('Choose a PNG, JPEG, HEIC, or other image file.'); return; }
    if (next.size > 18 * 1024 * 1024) { setError('Choose an image smaller than 18 MB.'); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next); setPreview(URL.createObjectURL(next)); stopCamera();
  }
  function stopCamera() {
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; setCameraOpen(false);
    if (video.current) video.current.srcObject = null;
  }
  async function startCamera() {
    setCameraError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Live camera is not available here. Use the phone camera button instead.');
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      stream.current = next; setCameraOpen(true);
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = next; void video.current.play(); } });
    } catch (error) { setCameraError(message(error)); setCameraOpen(false); }
  }
  async function capture() {
    const source = video.current;
    if (!source?.videoWidth) { setCameraError('The camera is still starting. Try again in a moment.'); return; }
    const canvas = document.createElement('canvas'); canvas.width = source.videoWidth; canvas.height = source.videoHeight;
    canvas.getContext('2d')?.drawImage(source, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .92));
    if (blob) choose(new File([blob], `receipt-${localDate()}.jpg`, { type: 'image/jpeg' }));
  }
  async function scan() {
    if (!file) return;
    setError(''); setDrafts([]); setDetected(null); setProgress(0.01); setStatus('Preparing on-device OCR');
    let worker: OcrWorker | null = null;
    try {
      const [{ createWorker, OEM }, image] = await Promise.all([import('tesseract.js'), readableImage(file)]);
      worker = await createWorker('eng', OEM.LSTM_ONLY, { workerPath: '/ocr/worker.min.js', corePath: '/ocr/core', langPath: '/ocr/lang', logger(update) { setStatus(update.status.replace(/^./, value => value.toUpperCase())); setProgress(Math.max(.03, update.progress)); } });
      activeWorker.current = worker;
      const result = await worker.recognize(image, { rotateAuto: true });
      const parsed = parseOcrText(result.data.text, mode);
      setDetected(parsed.documentType);
      setDrafts(parsed.drafts.map(draft => ({ ...draft, id: makeId(), selected: true, amount: (draft.amountCents / 100).toFixed(2) })));
      if (!parsed.drafts.length) setError(parsed.documentType === 'receipt' ? 'A final total was not found. Try a clearer photo or add the receipt manually.' : 'No transaction amounts were found. Try a clearer screenshot or switch the document type.');
      setStatus('Review before saving'); setProgress(1);
    } catch (error) { setError(message(error)); setStatus(''); setProgress(0); }
    finally { await worker?.terminate().catch(() => {}); if (activeWorker.current === worker) activeWorker.current = null; }
  }
  function update(id: string, change: Partial<ReviewDraft>) { setDrafts(current => current.map(draft => draft.id === id ? { ...draft, ...change } : draft)); }
  function save() {
    try {
      const transactions = drafts.filter(draft => draft.selected).map(draft => validateTransaction({ id: makeId(), type: draft.type, amountCents: parseAmount(draft.amount), title: draft.title, category: draft.category, role: draft.role, date: draft.date, note: `Imported from on-device OCR · ${detected === 'receipt' ? 'receipt final total' : 'transaction screenshot'}` }));
      if (!transactions.length) throw new Error('Select at least one draft to import.');
      onImport(transactions); setDrafts([]); setFile(null); setDetected(null); setStatus(''); setProgress(0);
      if (preview) URL.revokeObjectURL(preview); setPreview('');
    } catch (error) { setError(message(error)); }
  }

  return <div className="scan-layout">
    <section className="panel scan-intake">
      <div className="scan-heading"><span className="scan-icon"><ScanLine/></span><div><h2>Read it on this device.</h2><p>Import a MAE or TNG history screenshot, or photograph a receipt. The image never leaves this browser.</p></div></div>
      <div className="scan-source-grid">
        <button type="button" className="scan-source" onClick={() => fileInput.current?.click()} disabled={disabled}><Images/><strong>Choose screenshot</strong><span>Bank or e-wallet history</span></button>
        <button type="button" className="scan-source" onClick={() => cameraInput.current?.click()} disabled={disabled}><Camera/><strong>Use phone camera</strong><span>Opens the system camera</span></button>
        <button type="button" className="scan-source" onClick={cameraOpen ? stopCamera : () => void startCamera()} disabled={disabled}>{cameraOpen ? <VideoOff/> : <Video/>}<strong>{cameraOpen ? 'Close live camera' : 'Open live camera'}</strong><span>Camera inside Paypay</span></button>
      </div>
      <input ref={fileInput} className="sr-only" type="file" accept="image/*" onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }}/>
      <input ref={cameraInput} className="sr-only" type="file" accept="image/*" capture="environment" onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }}/>
      {cameraOpen && <div className="live-camera"><video ref={video} playsInline muted/><Button type="button" className="primary-action" onClick={() => void capture()}><Camera/>Take photo</Button></div>}
      {cameraError && <p className="scan-error" role="alert">{cameraError}</p>}
      {preview && <div className="scan-preview"><Image src={preview} alt="Selected document for local text recognition" width={900} height={900} unoptimized/><button type="button" aria-label="Remove selected image" onClick={() => { if (preview) URL.revokeObjectURL(preview); setPreview(''); setFile(null); setDrafts([]); }}><Trash2/></button></div>}
      <div className="scan-controls"><label htmlFor="ocr-document-type">Document type<NativeSelect id="ocr-document-type" value={mode} onChange={event => setMode(event.target.value as OcrMode)}><option value="auto">Detect automatically</option><option value="transactions">Transaction history</option><option value="receipt">Receipt</option></NativeSelect></label><Button className="primary-action" onClick={() => void scan()} disabled={!file || (!!status && progress < 1)}>{progress > 0 && progress < 1 ? <LoaderCircle className="scan-spin"/> : <ScanLine/>}{progress > 0 && progress < 1 ? 'Reading image…' : 'Read image'}</Button></div>
      {progress > 0 && <div className="scan-progress" aria-live="polite"><div><span>{status}</span><strong>{Math.round(progress * 100)}%</strong></div><div aria-hidden="true"><i style={{ width: `${progress * 100}%` }}/></div></div>}
      <p className="scan-privacy"><ShieldCheck/>OCR runs with self-hosted browser files. Images are discarded after review; only approved entries go to local storage.</p>
    </section>
    <section className="panel scan-review">
      <div className="review-heading"><div><p className="eyebrow">REVIEW FIRST</p><h2>{detected ? `${detected === 'receipt' ? 'Receipt total' : 'Transaction'} drafts` : 'Nothing saves itself.'}</h2></div>{detected && <span>{detected === 'receipt' ? '1 final total at most' : 'MAE / TNG friendly'}</span>}</div>
      {!drafts.length ? <div className="review-empty"><FileImage/><h3>Your editable drafts appear here.</h3><p>Check every amount, date, type, and category. OCR can misread text, especially in compressed screenshots.</p></div> : <div className="review-list">{drafts.map((draft, index) => <article key={draft.id} className={`review-card ${draft.selected ? '' : 'is-off'}`}>
        <div className="review-card-top"><label className="draft-check"><input type="checkbox" checked={draft.selected} onChange={event => update(draft.id, { selected: event.target.checked })}/><span>Import draft {index + 1}</span></label><button type="button" onClick={() => setDrafts(current => current.filter(item => item.id !== draft.id))} aria-label={`Remove draft ${index + 1}`}><Trash2/></button></div>
        <div className="review-fields"><label htmlFor={`${draft.id}-title`}>Description<Input id={`${draft.id}-title`} maxLength={80} value={draft.title} onChange={event => update(draft.id, { title: event.target.value })}/></label><label htmlFor={`${draft.id}-amount`}>Amount ({currencySymbol(currency)})<Input id={`${draft.id}-amount`} inputMode="decimal" value={draft.amount} onChange={event => update(draft.id, { amount: event.target.value })}/></label><label htmlFor={`${draft.id}-type`}>Type<NativeSelect id={`${draft.id}-type`} value={draft.type} onChange={event => update(draft.id, { type: event.target.value as 'expense' | 'income' })}><option value="expense">Expense</option><option value="income">Income</option></NativeSelect></label><label htmlFor={`${draft.id}-category`}>Category<Input id={`${draft.id}-category`} list="ocr-category-suggestions" maxLength={60} value={draft.category} onChange={event => update(draft.id, { category: event.target.value })}/></label><label htmlFor={`${draft.id}-role`}>Area of life<NativeSelect id={`${draft.id}-role`} value={draft.role} onChange={event => update(draft.id, { role: event.target.value as Role })}><option>Personal</option><option>University</option><option>Freelance</option><option>Internship</option></NativeSelect></label><label htmlFor={`${draft.id}-date`}>Date<Input id={`${draft.id}-date`} type="date" min="2000-01-01" max={localDate()} value={draft.date} onChange={event => update(draft.id, { date: event.target.value })}/></label></div>
        <p className="source-line">Read from: “{draft.sourceLine.slice(0, 140)}”</p>
      </article>)}<datalist id="ocr-category-suggestions">{suggestions.map(category => <option key={category} value={category}>{category}</option>)}</datalist><Button className="primary-action import-drafts" onClick={save} disabled={!selected}><Check/>Import {selected} {selected === 1 ? 'entry' : 'entries'}</Button><Button variant="ghost" className="reset-scan" onClick={() => { setDrafts([]); setDetected(null); setProgress(0); setStatus(''); }}><RotateCcw/>Start review again</Button></div>}
      {error && <p className="scan-error" role="alert">{error}</p>}
    </section>
  </div>;
}
