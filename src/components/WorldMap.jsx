import { useState, useEffect } from 'react';
import './WorldMap.css';

// Lazy load react-simple-maps to prevent crashes
let ComposableMap, Geographies, Geography, ZoomableGroup;
try {
  const rsm = require('react-simple-maps');
  ComposableMap = rsm.ComposableMap;
  Geographies = rsm.Geographies;
  Geography = rsm.Geography;
  ZoomableGroup = rsm.ZoomableGroup;
} catch (e) {
  console.error('react-simple-maps not available:', e);
}

const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// Country name mapping to standardize variations - MUST match IncomeTracker.jsx
const COUNTRY_MAPPING = {
  // From IncomeTracker countryMap
  'US': 'United States',
  'USA': 'United States',
  'United States of America': 'United States',
  'GB': 'United Kingdom',
  'UK': 'United Kingdom',
  'DE': 'Germany',
  'Deutschland': 'Germany',
  'FR': 'France',
  'NL': 'Netherlands',
  'Holland': 'Netherlands',
  'CH': 'Switzerland',
  'Schweiz': 'Switzerland',
  'CA': 'Canada',
  'AU': 'Australia',
  'BE': 'Belgium',
  'Belgique': 'Belgium',
  'AT': 'Austria',
  'Österreich': 'Austria',
  'IE': 'Ireland',
  'ES': 'Spain',
  'España': 'Spain',
  'IT': 'Italy',
  'Italia': 'Italy',
  'SE': 'Sweden',
  'Sverige': 'Sweden',
  'NO': 'Norway',
  'Norge': 'Norway',
  'DK': 'Denmark',
  'Danmark': 'Denmark',
  'FI': 'Finland',
  'Suomi': 'Finland',
  'PL': 'Poland',
  'Polska': 'Poland',
  'CZ': 'Czech Republic',
  'Czech': 'Czech Republic',
  'Czechia': 'Czech Republic',
  'HU': 'Hungary',
  'RO': 'Romania',
  'BG': 'Bulgaria',
  'GR': 'Greece',
  'PT': 'Portugal',
  'IN': 'India',
  'CN': 'China',
  'JP': 'Japan',
  'KR': 'South Korea',
  'Korea': 'South Korea',
  'South Korea': 'South Korea',
  'SG': 'Singapore',
  'HK': 'Hong Kong',
  'AE': 'United Arab Emirates',
  'UAE': 'United Arab Emirates',
  'Dubai': 'United Arab Emirates',
  'SA': 'Saudi Arabia',
  'Saudi Arabia': 'Saudi Arabia',
  'IL': 'Israel',
  'BR': 'Brazil',
  'Brasil': 'Brazil',
  'MX': 'Mexico',
  'México': 'Mexico',
  'AR': 'Argentina',
  'CL': 'Chile',
  'CO': 'Colombia',
  'PE': 'Peru'
};

function WorldMap({ invoices = [] }) {
  const [workedCountries, setWorkedCountries] = useState({});
  const [geoData, setGeoData] = useState(null);

  const [currentCountry, setCurrentCountry] = useState(null);
  const [hoveredCountry, setHoveredCountry] = useState(null);
  const [showStats, setShowStats] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);

  // Fetch geography data
  useEffect(() => {
    const loadGeoData = async () => {
      try {
        const response = await fetch(geoUrl);
        const data = await response.json();
        setGeoData(data);
      } catch (err) {
        console.error('Failed to load geography data:', err);
        setError('Failed to load map data');
      }
    };
    loadGeoData();
  }, []);

  // Process invoices and extract countries automatically
  useEffect(() => {
    console.log('=== WorldMap Debug ===');
    console.log('Total invoices received:', invoices?.length || 0);
    console.log('Sample invoice:', invoices?.[0]);
    console.log('All invoice countries:', invoices?.map(i => i.country));

    if (!geoData || !invoices || invoices.length === 0) {
      console.log('Stopping: geoData?', !!geoData, 'invoices?', !!invoices, 'length:', invoices?.length);
      setIsLoading(false);
      return;
    }

    const geographies = geoData.objects.countries.geometries;
    const countriesData = {};

    // Group invoices by country
    const invoicesByCountry = invoices.reduce((acc, invoice) => {
      const country = invoice.country;
      if (!country || country === '-') {
        console.log('Skipping invoice with no country:', invoice.client);
        return acc;
      }

      // Normalize country name
      const normalizedCountry = COUNTRY_MAPPING[country] || country;
      console.log(`Normalizing: "${country}" → "${normalizedCountry}"`);

      if (!acc[normalizedCountry]) {
        acc[normalizedCountry] = [];
      }
      acc[normalizedCountry].push({
        client: invoice.client,
        date: invoice.date,
        amount: invoice.amountUSD
      });
      return acc;
    }, {});

    // Match countries to ISO codes
    console.log('Countries to match:', Object.keys(invoicesByCountry));
    console.log('Available geo names (first 10):', geographies.slice(0, 10).map(g => g.properties.name));

    Object.entries(invoicesByCountry).forEach(([countryName, invoiceList]) => {
      const geo = geographies.find(g => {
        const geoName = g.properties.name;
        const geoNameLower = geoName.toLowerCase().replace(/[áàâäãåā]/g, 'a').replace(/[éèêëē]/g, 'e').replace(/[íìîïī]/g, 'i').replace(/[óòôöõō]/g, 'o').replace(/[úùûüū]/g, 'u');
        const countryNameLower = countryName.toLowerCase().replace(/[áàâäãåā]/g, 'a').replace(/[éèêëē]/g, 'e').replace(/[íìîïī]/g, 'i').replace(/[óòôöõō]/g, 'o').replace(/[úùûüū]/g, 'u');

        // Exact match
        if (geoName === countryName) return true;
        if (geoNameLower === countryNameLower) return true;

        // Contains match (bidirectional)
        if (geoNameLower.includes(countryNameLower)) return true;
        if (countryNameLower.includes(geoNameLower)) return true;

        // Special cases for common mismatches
        if (countryName === 'United States' && geoName === 'United States of America') return true;
        if (countryName === 'United Kingdom' && geoName === 'United Kingdom') return true;
        if (countryName === 'Czech Republic' && (geoName === 'Czechia' || geoName === 'Czech Republic')) return true;
        if (countryName === 'South Korea' && (geoName === 'Korea' || geoName === 'Republic of Korea' || geoName === 'South Korea')) return true;
        if (countryName === 'Hong Kong' && (geoName === 'Hong Kong' || geoName.includes('Hong Kong'))) return true;

        // Mexico variations
        if ((countryName === 'Mexico' || countryName === 'México') && (geoName === 'Mexico' || geoName === 'México')) return true;

        return false;
      });

      if (geo) {
        const countryCode = geo.properties.iso_a3;
        countriesData[countryCode] = {
          name: countryName,
          addedAt: new Date().toISOString(),
          clients: invoiceList
        };
        console.log('✓ Matched:', countryName, '→', geo.properties.name, '(', countryCode, ')');
      } else {
        console.warn('✗ Could not match country:', countryName, '- Try one of:', geographies.slice(0, 5).map(g => g.properties.name));
      }
    });

    setWorkedCountries(countriesData);
    setIsLoading(false);
  }, [invoices, geoData]);

  // Detect current country on component mount
  useEffect(() => {
    const detectCurrentCountry = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.country_name) {
          setCurrentCountry(data.country_name);
        }
      } catch (error) {
        console.error('Could not detect country:', error);
      }
    };
    detectCurrentCountry();
  }, []);

  const handleCountryClick = (geo) => {
    const countryCode = geo.properties.iso_a3;
    if (workedCountries[countryCode]) {
      setSelectedCountry(selectedCountry === countryCode ? null : countryCode);
    }
  };

  const workedCountriesList = Object.entries(workedCountries).map(([code, data]) => ({
    code,
    ...data
  }));

  const totalCountries = 195; // Approximate total countries
  const workedCount = workedCountriesList.length;
  const percentage = ((workedCount / totalCountries) * 100).toFixed(1);

  // If react-simple-maps is not available, show fallback
  if (!ComposableMap || !Geographies || !Geography || !ZoomableGroup) {
    return (
      <div className="world-map-container">
        <div className="map-header">
          <div className="map-title">
            <h2>🌍 Çalıştığım Ülkeler</h2>
          </div>
        </div>
        <div className="map-error" style={{ padding: '40px', textAlign: 'center' }}>
          <p>⚠️ Harita bileşeni yüklenemedi</p>
          <p style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
            Terminal'de şu komutu çalıştırın: <code>npm install react-simple-maps</code>
          </p>
        </div>
        {workedCountriesList.length > 0 && (
          <div className="countries-list">
            <h3>Çalıştığım Ülkeler ({workedCount})</h3>
            <div className="countries-grid">
              {workedCountriesList.map(({ code, name, clients = [] }) => {
                const totalAmount = clients.reduce((sum, c) => sum + c.amount, 0);
                return (
                  <div key={code} className="country-card">
                    <div className="country-card-header">
                      <span className="country-name">{name}</span>
                      <span className="country-total">${totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="world-map-container">
      <div className="map-header">
        <div className="map-title">
          <h2>🌍 Çalıştığım Ülkeler</h2>
          {currentCountry && (
            <div className="current-location">
              <span className="location-dot">📍</span>
              Şu anki konumunuz: {currentCountry}
            </div>
          )}
        </div>

        <div className="map-actions">
          <button
            className="btn-toggle-stats"
            onClick={() => setShowStats(!showStats)}
          >
            {showStats ? 'İstatistikleri Gizle' : 'İstatistikleri Göster'}
          </button>
        </div>
      </div>

      {showStats && (
        <div className="map-stats">
          <div className="stat-card">
            <div className="stat-value">{workedCount}</div>
            <div className="stat-label">Ülke Sayısı</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{percentage}%</div>
            <div className="stat-label">Dünya Kapsamı</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {workedCountriesList.length > 0
                ? new Date(workedCountriesList[workedCountriesList.length - 1].addedAt).getFullYear()
                : '-'}
            </div>
            <div className="stat-label">Son Yıl</div>
          </div>
        </div>
      )}

      <div className="map-wrapper">
        {isLoading && (
          <div className="map-loading">
            <div className="loading-spinner"></div>
            <p>Harita yükleniyor...</p>
          </div>
        )}

        {error && (
          <div className="map-error">
            <p>⚠️ Harita yükleme hatası: {error}</p>
            <button onClick={() => window.location.reload()}>Yeniden Dene</button>
          </div>
        )}

        {!isLoading && !error && (
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{
              scale: 120,
            }}
            style={{
              width: '100%',
              height: '500px',
            }}
          >
            <ZoomableGroup zoom={1} center={[0, 20]}>
              <Geographies geography={geoUrl}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const countryCode = geo.properties.iso_a3;
                    const isWorked = workedCountries[countryCode];
                    const isHovered = hoveredCountry === geo.properties.name;

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onClick={() => handleCountryClick(geo)}
                        onMouseEnter={() => setHoveredCountry(geo.properties.name)}
                        onMouseLeave={() => setHoveredCountry(null)}
                        style={{
                          default: {
                            fill: isWorked ? '#10b981' : '#374151',
                            stroke: '#1f2937',
                            strokeWidth: 0.5,
                            outline: 'none',
                          },
                          hover: {
                            fill: isWorked ? '#34d399' : '#4b5563',
                            stroke: '#10b981',
                            strokeWidth: 1,
                            outline: 'none',
                            cursor: 'pointer',
                          },
                          pressed: {
                            fill: '#059669',
                            outline: 'none',
                          },
                        }}
                      />
                    );
                  })
                }
              </Geographies>

              {/* Add markers for worked countries */}
              {workedCountriesList.map(({ code, name }) => {
                // You can add custom coordinates for markers if needed
                // For now, this is commented out
                return null;
              })}
            </ZoomableGroup>
          </ComposableMap>
        )}

        {hoveredCountry && (
          <div className="country-tooltip">
            {hoveredCountry}
            {workedCountries[Object.keys(workedCountries).find(
              code => workedCountries[code].name === hoveredCountry
            )] && ' ✓'}
          </div>
        )}
      </div>

      {workedCountriesList.length > 0 && (
        <div className="countries-list">
          <h3>Çalıştığım Ülkeler ve Müşteriler ({workedCount})</h3>
          <div className="countries-grid">
            {workedCountriesList
              .sort((a, b) => {
                const totalA = a.clients?.reduce((sum, c) => sum + c.amount, 0) || 0;
                const totalB = b.clients?.reduce((sum, c) => sum + c.amount, 0) || 0;
                return totalB - totalA;
              })
              .map(({ code, name, clients = [] }) => {
                const totalAmount = clients.reduce((sum, c) => sum + c.amount, 0);
                const clientsByName = clients.reduce((acc, c) => {
                  if (!acc[c.client]) {
                    acc[c.client] = { count: 0, total: 0 };
                  }
                  acc[c.client].count += 1;
                  acc[c.client].total += c.amount;
                  return acc;
                }, {});

                return (
                  <div key={code} className="country-card">
                    <div className="country-card-header">
                      <span className="country-flag">{code}</span>
                      <span className="country-name">{name}</span>
                      <span className="country-total">${totalAmount.toFixed(2)}</span>
                    </div>
                    <div className="country-card-body">
                      <div className="country-clients">
                        <strong>Müşteriler ({Object.keys(clientsByName).length}):</strong>
                        {Object.entries(clientsByName)
                          .sort((a, b) => b[1].total - a[1].total)
                          .map(([clientName, data]) => (
                            <div key={clientName} className="client-item">
                              <span className="client-name">{clientName}</span>
                              <span className="client-stats">
                                {data.count} fatura • ${data.total.toFixed(2)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {workedCountriesList.length === 0 && !isLoading && (
        <div className="countries-list">
          <div className="empty-state">
            <p>Henüz ülke verisi yok</p>
            <p>Gelir Takibi bölümünden PDF faturalarınızı tarayın</p>
          </div>
        </div>
      )}

      <div className="map-instructions">
        <p>💡 Ülkeler otomatik olarak yüklediğiniz faturalardan algılanır</p>
        <p>📊 Haritadaki ülkelere tıklayarak müşteri detaylarını görebilirsiniz</p>
      </div>

      {/* Debug Info */}
      <div style={{ marginTop: '20px', padding: '15px', background: '#1a1a1a', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace' }}>
        <div style={{ color: '#888', marginBottom: '10px' }}>🐛 Debug Bilgisi:</div>
        <div style={{ color: '#e0e0e0' }}>Toplam Fatura: {invoices?.length || 0}</div>
        <div style={{ color: '#e0e0e0' }}>Haritada Gösterilen Ülke: {workedCount}</div>
        <div style={{ color: '#888', marginTop: '8px' }}>
          Unique Ülkeler: {[...new Set(invoices?.map(i => i.country).filter(c => c && c !== '-'))].join(', ') || 'Yok'}
        </div>
        <div style={{ color: '#e0e0e0', marginTop: '8px' }}>
          Eşleşen: {Object.values(workedCountries).map(c => c.name).join(', ') || 'Yok'}
        </div>
      </div>
    </div>
  );
}

export default WorldMap;
