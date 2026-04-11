import { useState } from 'react';
import './SilkroadCalc.css';

const PRESET_SILK_PRICES = [450, 460, 470, 480];

const fmtGold = (m) => {
  if (m >= 1000) return `${(m / 1000).toFixed(2)}B`;
  if (m >= 1)    return `${m.toFixed(0)}M`;
  return `${(m * 1000).toFixed(0)}K`;
};

export default function SilkroadCalc() {
  const [silkPaid, setSilkPaid] = useState(100);
  const [silkPaidRaw, setSilkPaidRaw] = useState('100');
  const [barReceived, setBarReceived] = useState(50);
  const [barReceivedRaw, setBarReceivedRaw] = useState('50');
  const [silkPrice, setSilkPrice] = useState(460);
  const [customSilkPrice, setCustomSilkPrice] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const effectiveSilkPrice = useCustom && customSilkPrice !== '' ? Number(customSilkPrice) : silkPrice;
  const goldPerSilk = barReceived / silkPaid;
  const silkPerM    = silkPaid / barReceived;

  return (
    <div className="sro-calc">
      <div className="sro-header">
        <h2 className="sro-title">Silkroad Gold/Silk Hesap Makinesi</h2>
      </div>

      <div className="sro-body">
        {/* Bazar Ayarı */}
        <div className="sro-card">
          <h3 className="sro-card-title">Bazar Ayarı</h3>

          <div className="sro-field">
            <label>Alınan 1M Gold Bar sayısı</label>
            <div className="sro-input-row">
              <button onClick={() => { const v = Math.max(1, barReceived - 1); setBarReceived(v); setBarReceivedRaw(String(v)); }}>−</button>
              <input
                type="number"
                value={barReceivedRaw}
                onChange={e => { setBarReceivedRaw(e.target.value); const n = Number(e.target.value); if (n > 0) setBarReceived(n); }}
                onBlur={() => { if (barReceived < 1) { setBarReceived(1); setBarReceivedRaw('1'); } }}
              />
              <button onClick={() => { const v = barReceived + 1; setBarReceived(v); setBarReceivedRaw(String(v)); }}>+</button>
            </div>
            <span className="sro-hint">= {fmtGold(barReceived)} gold</span>
          </div>

          <div className="sro-field">
            <label>Ödenen Silk</label>
            <div className="sro-input-row">
              <button onClick={() => { const v = Math.max(1, silkPaid - 10); setSilkPaid(v); setSilkPaidRaw(String(v)); }}>−</button>
              <input
                type="number"
                value={silkPaidRaw}
                onChange={e => { setSilkPaidRaw(e.target.value); const n = Number(e.target.value); if (n > 0) setSilkPaid(n); }}
                onBlur={() => { if (silkPaid < 1) { setSilkPaid(1); setSilkPaidRaw('1'); } }}
              />
              <button onClick={() => { const v = silkPaid + 10; setSilkPaid(v); setSilkPaidRaw(String(v)); }}>+</button>
            </div>
          </div>

          <div className="sro-field">
            <label>1k Silk piyasa fiyatı (M Gold)</label>
            <div className="sro-preset-row">
              {PRESET_SILK_PRICES.map(p => (
                <button
                  key={p}
                  className={`sro-preset${!useCustom && silkPrice === p ? ' active' : ''}`}
                  onClick={() => { setSilkPrice(p); setUseCustom(false); }}
                >{p}M</button>
              ))}
              <input
                className={`sro-custom-price${useCustom ? ' active' : ''}`}
                type="number"
                placeholder="Özel..."
                value={customSilkPrice}
                onChange={e => { setCustomSilkPrice(e.target.value); setUseCustom(true); }}
                onFocus={() => setUseCustom(true)}
              />
            </div>
          </div>
        </div>

        {/* Dönüşüm */}
        <div className="sro-card sro-convert-card">
          <h3 className="sro-card-title">Dönüşüm</h3>
          <p className="sro-convert-rate">
            {silkPaid} silk = {fmtGold(barReceived)} &nbsp;·&nbsp;
            <strong>1 silk = {fmtGold(goldPerSilk)}</strong>
            &nbsp;·&nbsp;
            <strong>1M = {silkPerM.toFixed(3)} silk</strong>
          </p>
          <div className="sro-convert-cols">
            <div>
              <div className="sro-convert-header">Silk → Gold</div>
              {[10, 50, 100, 200, 500, 1000, 2000].map(s => (
                <div className="sro-convert-row" key={s}>
                  <span>{s >= 1000 ? `${s/1000}k` : s} silk</span>
                  <span className="sro-convert-arrow">→</span>
                  <strong>{fmtGold((s / silkPaid) * barReceived)}</strong>
                </div>
              ))}
            </div>
            <div className="sro-convert-divider-v" />
            <div>
              <div className="sro-convert-header">Gold → Silk</div>
              {[100, 200, 500, 1000, 2000, 5000, 10000].map(m => (
                <div className="sro-convert-row" key={m}>
                  <span>{m >= 1000 ? `${m/1000}B` : `${m}M`}</span>
                  <span className="sro-convert-arrow">→</span>
                  <strong>{((m / barReceived) * silkPaid).toFixed(1)} silk</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Arena Coin */}
      <ArenaCoinCalc />
    </div>
  );
}

function ArenaCoinCalc() {
  const [coins, setCoins] = useState('10');
  const [silk, setSilk] = useState('100');

  const coinN = Number(coins) || 0;
  const silkN = Number(silk) || 0;
  const rate = coinN > 0 ? silkN / coinN : 0; // 1 coin = kaç silk

  return (
    <div className="sro-arena-section">
      <h3 className="sro-arena-title">Arena Coin → Silk</h3>
      <div className="sro-body" style={{ marginTop: 0 }}>
        <div className="sro-card">
          <h3 className="sro-card-title">Bazar Ayarı</h3>

          <div className="sro-field">
            <label>Satılan Arena Coin</label>
            <div className="sro-input-row">
              <input type="number" value={coins} onChange={e => setCoins(e.target.value)} />
            </div>
          </div>

          <div className="sro-field">
            <label>Karşılığında alınan Silk</label>
            <div className="sro-input-row">
              <input type="number" value={silk} onChange={e => setSilk(e.target.value)} />
            </div>
          </div>

          {rate > 0 && (
            <div className="sro-arena-rate">
              1 Arena Coin = <strong>{rate % 1 === 0 ? rate : rate.toFixed(2)} silk</strong>
            </div>
          )}
        </div>

        {rate > 0 && (
          <div className="sro-card">
            <h3 className="sro-card-title">Hızlı Tablo</h3>
            {[1, 5, 10, 20, 50, 100, 200, 500, 1000].map(c => (
              <div className="sro-convert-row" key={c}>
                <span>{c} coin</span>
                <span className="sro-convert-arrow">→</span>
                <strong>{(c * rate) % 1 === 0 ? (c * rate).toLocaleString() : (c * rate).toFixed(1)} silk</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
