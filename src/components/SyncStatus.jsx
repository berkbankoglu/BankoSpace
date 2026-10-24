import { useEffect, useState } from 'react';
import { subscribeSyncStatus } from '../sync';
import './SyncStatus.css';

// One line in the sidebar footer saying whether this device and the cloud are
// in step: sending, up to date, changes waiting, or offline — and which other
// device on the account is open right now. So that whether an edit went out
// is something you can see instead of something you have to guess.

const LABEL = {
  connecting: 'Connecting…',
  sending: 'Sending…',
  synced: 'Synced',
  unsent: null,   // "N waiting", built below
  offline: 'Offline',
  'media-error': 'Images need attention',
};

const DEVICE = { mac: 'Mac', windows: 'Windows', other: 'Other device' };

function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export default function SyncStatus({ compact }) {
  const [status, setStatus] = useState(null);
  const [, tick] = useState(0);

  useEffect(() => subscribeSyncStatus(setStatus), []);
  // Keep "2 min ago" honest while nothing else changes.
  useEffect(() => {
    const iv = setInterval(() => tick(n => n + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  if (!status) return null;

  const { kind, unsent, lastOk, others } = status;
  const label = kind === 'unsent'
    ? `${unsent} waiting`
    : kind === 'offline' && unsent ? `Offline · ${unsent} waiting` : LABEL[kind];
  const open = others.filter(o => o.active);

  const lines = [];
  if (kind === 'synced') lines.push('Everything here is in the cloud.');
  if (kind === 'sending') lines.push('Sending your latest changes.');
  if (kind === 'unsent') lines.push(`${unsent} change${unsent === 1 ? '' : 's'} not sent yet — they go as soon as the cloud is reachable.`);
  if (kind === 'offline') lines.push(`Can't reach the cloud. ${unsent ? `${unsent} change${unsent === 1 ? '' : 's'} kept here and sent when it is back.` : 'Your changes are kept here meanwhile.'}`);
  if (kind === 'media-error') lines.push('Some note images could not sync. Reconnect, or restore unavailable images from a backup or the device that still has them.');
  if (kind === 'connecting') lines.push('Reading your data from the cloud.');
  if (lastOk) lines.push(`Last in touch with the cloud ${ago(lastOk)}.`);
  others.forEach(o => {
    const name = DEVICE[o.platform] || DEVICE.other;
    lines.push(o.active
      ? `${name} is open now${o.app ? ` (v${o.app})` : ''} — changes there arrive within seconds.`
      : `${name} last seen ${ago(o.lastSeen)}.`);
  });

  return (
    <span className={`sync-status sync-${kind}`} title={lines.join('\n')}>
      <span className="sync-dot" />
      {!compact && (
        <>
          <span className="sync-label">{label}</span>
          {open.length > 0 && (
            <span className="sync-other">· {open.map(o => DEVICE[o.platform] || DEVICE.other).join(', ')} open</span>
          )}
        </>
      )}
    </span>
  );
}
