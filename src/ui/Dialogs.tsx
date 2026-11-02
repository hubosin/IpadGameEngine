import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Modal } from './widgets';
import { useProject } from '../core/store';
import { createBlankProject, createDefaultProject, migrateProject } from '../core/defaults';
import { deleteLocal, hasServer, listLocal, listServer, loadLocal, loadServer, pickFile, saveServer, serverHosts, type ProjectMeta } from '../core/storage';
import { openProject } from '../core/projectActions';

export async function importProjectFile() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  try {
    openProject(migrateProject(JSON.parse(await f.text())));
  } catch (e) {
    alert('Could not import: ' + (e as Error).message);
  }
}

export function OpenDialog({ onClose }: { onClose: () => void }) {
  const [local, setLocal] = useState<ProjectMeta[]>([]);
  const [server, setServer] = useState<ProjectMeta[] | null>(null);
  const refresh = async () => {
    setLocal(await listLocal());
    setServer((await hasServer()) ? await listServer() : null);
  };
  useEffect(() => { refresh(); }, []);
  const current = useProject((s) => s.project.id);
  const open = async (id: string, where: 'local' | 'server') => {
    try {
      const p = where === 'local' ? await loadLocal(id) : await loadServer(id);
      if (p) { openProject(p); onClose(); }
    } catch (e) { alert((e as Error).message); }
  };
  const row = (m: ProjectMeta, where: 'local' | 'server') => (
    <div key={where + m.id} className={'list-item' + (m.id === current ? ' sel' : '')} onClick={() => open(m.id, where)}>
      <span className="name">{m.name}</span>
      <span className="dim small">{new Date(m.updatedAt).toLocaleString()}</span>
      {where === 'local' && m.id !== current && (
        <button className="ibtn" title="Remove from this device" onClick={async (e) => {
          e.stopPropagation();
          if (confirm(`Remove "${m.name}" from this device's storage? (Copies on the PC are kept.)`)) { await deleteLocal(m.id); refresh(); }
        }}>🗑</button>
      )}
    </div>
  );
  return (
    <Modal title="Open Project" onClose={onClose}>
      <div className="row">
        <button className="btn primary" onClick={() => { const n = prompt('Project name', 'Untitled'); if (n === null) return; openProject(createBlankProject(n.trim() || 'Untitled')); onClose(); }}>New blank project</button>
        <button className="btn" onClick={() => { openProject(createDefaultProject('New Game')); onClose(); }}>New from starter template</button>
        <button className="btn" onClick={() => { importProjectFile(); onClose(); }}>Import .json file…</button>
      </div>
      <h3>On the PC (shared with iPad)</h3>
      {server === null ? <div className="hint">PC server not reachable from this page.</div> : server.length ? server.map((m) => row(m, 'server')) : <div className="hint">None yet.</div>}
      <h3>On this device</h3>
      {local.length ? local.map((m) => row(m, 'local')) : <div className="hint">None yet.</div>}
    </Modal>
  );
}

function Qr({ url }: { url: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(url, { margin: 1, width: 220 }).then(setSrc).catch(() => setSrc('')); }, [url]);
  return src ? <img src={src} width={180} height={180} style={{ background: '#fff', borderRadius: 6 }} /> : null;
}

/** Everything needed to get the game (or the editor) onto an iPad from Windows, no Mac. */
export function IpadDialog({ onClose }: { onClose: () => void }) {
  const project = useProject((s) => s.project);
  const [hosts, setHosts] = useState<string[] | null>(null);
  const [synced, setSynced] = useState<string>('');
  useEffect(() => {
    (async () => {
      if (!(await hasServer())) { setHosts([]); return; }
      try {
        await saveServer({ ...project, updatedAt: Date.now() });
        setSynced('Latest version saved to the PC.');
      } catch (e) { setSynced('Could not save to PC: ' + (e as Error).message); }
      const h = await serverHosts();
      const onLan = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
      setHosts(onLan ? [location.hostname, ...h.filter((x) => x !== location.hostname)] : h);
    })();
  }, []);
  const port = location.port ? ':' + location.port : '';
  const host = hosts?.[0];
  const playUrl = host ? `http://${host}${port}/play.html?project=${encodeURIComponent(project.id)}` : '';
  const editorUrl = host ? `http://${host}${port}/?project=${encodeURIComponent(project.id)}` : '';
  return (
    <Modal title="Run on iPad (no Mac needed)" onClose={onClose}>
      {hosts === null && <div className="hint">Checking network…</div>}
      {hosts && !host && (
        <div className="hint">
          The PC server isn't reachable from this page, so instant Wi-Fi play isn't available here.
          Start the engine with <code>npm run dev</code> (or double-click <code>Start iPad Server.bat</code>), or use
          <b> File → Export Game (.html)</b> and upload that file to any web host.
        </div>
      )}
      {host && (
        <>
          <div className="dim small">{synced} iPad and PC must be on the same Wi-Fi.</div>
          <div className="row" style={{ alignItems: 'flex-start', gap: 20, marginTop: 10 }}>
            <div className="col" style={{ alignItems: 'center', maxWidth: 260 }}>
              <b>▶ Play this game</b>
              <Qr url={playUrl} />
              <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{playUrl}</code>
            </div>
            <div className="col" style={{ alignItems: 'center', maxWidth: 260 }}>
              <b>✎ Open the editor on iPad</b>
              <Qr url={editorUrl} />
              <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{editorUrl}</code>
            </div>
          </div>
          <h3>Steps</h3>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Point the iPad camera at a QR code and tap the link (or type the address into Safari).</li>
            <li>Optional: in Safari tap <b>Share → Add to Home Screen</b> to get a full-screen app icon.</li>
            <li>Edits on the PC autosave to the PC; reload the game on the iPad to get the newest version.</li>
            <li>If the page won't load: allow Node.js through Windows Firewall on <b>Private</b> networks.</li>
          </ol>
          <h3>Away from home Wi-Fi?</h3>
          <div className="hint">Use <b>File → Export Game (.html)</b>. Upload the single file to any static host (GitHub Pages, Netlify Drop, itch.io) and open it on the iPad. The game remembers the last loaded version for offline play when opened via the Wi-Fi link.</div>
        </>
      )}
    </Modal>
  );
}
