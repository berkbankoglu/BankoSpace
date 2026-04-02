import React, { useState, useEffect } from 'react';
import { open, ask } from '@tauri-apps/plugin-dialog';
import { readDir, readFile } from '@tauri-apps/plugin-fs';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './IncomeTracker.css';


// PDF.js worker - use local bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function IncomeTracker() {
  const [invoices, setInvoices] = useState(() => {
    const saved = localStorage.getItem('invoices');
    return saved ? JSON.parse(saved) : [];
  });
  const [basePath, setBasePath] = useState(() => {
    return localStorage.getItem('invoiceBasePath') || '';
  });
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({
    phase: '', // 'searching', 'reading'
    total: 0,
    current: 0,
    currentFile: '',
    success: [],
    failed: []
  });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [chartYear, setChartYear] = useState(new Date().getFullYear().toString()); // Year selection for chart
  const [chartMode, setChartMode] = useState('monthly'); // 'monthly' veya 'yearly'
  const [clientFilter, setClientFilter] = useState('all'); // Client filtresi
  const [view, setView] = useState('dashboard'); // 'dashboard', 'list', 'add'
  const [collapsedSections, setCollapsedSections] = useState({ read: false, unread: false });
  const [sortOrder, setSortOrder] = useState('date-desc'); // 'date-desc', 'date-asc', 'amount-desc', 'amount-asc'
  const [manualEntry, setManualEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    client: '',
    description: '',
    amountUSD: '',
    amountTRY: '',
    invoiceNo: ''
  });

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('invoices', JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    if (basePath) {
      localStorage.setItem('invoiceBasePath', basePath);
    }
  }, [basePath]);

  // Extract text from PDF using pdfjs-dist - improved version
  const extractPdfText = async (pdfData) => {
    let pdf = null;
    try {
      pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      let fullText = '';

      // Read all pages (max 5 pages - for memory)
      const maxPages = Math.min(pdf.numPages, 5);
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // Merge items better - add spaces and line breaks
        let pageText = '';
        let lastY = null;
        for (const item of textContent.items) {
          // New line check
          if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
            pageText += '\n';
          } else if (pageText.length > 0) {
            pageText += ' ';
          }
          pageText += item.str;
          lastY = item.transform[5];
        }

        fullText += pageText + '\n\n';
        page.cleanup();
      }

      return { text: fullText, error: null };
    } catch (error) {
      console.error('PDF extraction error:', error);
      return { text: '', error: error.message || 'Could not read PDF' };
    } finally {
      if (pdf) {
        try {
          pdf.destroy();
        } catch (e) {
          // ignore cleanup errors
        }
      }
    }
  };

  // Parse e-SMM PDF text content
  const parseInvoiceText = (text, fileName) => {
    const errors = [];

    // Document Number
    const invoiceNoMatch = text.match(/GIB\d+/);
    const invoiceNo = invoiceNoMatch ? invoiceNoMatch[0] : fileName.replace('.pdf', '');

    // Date - try various formats
    let date = null;
    const datePatterns = [
      // e-SMM spesifik formatlar
      /Düzenlenme Tarihi[:\s]*(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/i,
      /Düzenleme Tarihi[:\s]*(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/i,
      /Makbuz Tarihi[:\s]*(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/i,
      /Belge Tarihi[:\s]*(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/i,
      /Tarih[:\s]*(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/i,
      // General date formats
      /(\d{2})[\/\.\-](\d{2})[\/\.\-](20\d{2})/,
      // YYYY-MM-DD format
      /(20\d{2})[\/\.\-](\d{2})[\/\.\-](\d{2})/,
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        // Check YYYY-MM-DD format
        if (match[1].length === 4) {
          // YYYY-MM-DD format
          date = `${match[1]}-${match[2]}-${match[3]}`;
        } else {
          // DD/MM/YYYY format
          date = `${match[3]}-${match[2]}-${match[1]}`;
        }
        break;
      }
    }

    if (!date) {
      errors.push('Date not found');
      date = new Date().toISOString().split('T')[0];
    }

    // Recipient / Client - detect GIB e-SMM format
    let client = null;
    let fullClientInfo = null;

    // Find the "ALICI BİLGİLERİ" section in GIB e-SMM format
    // and read the lines below it
    const aliciBilgileriMatch = text.match(/ALICI\s*B[İI]LG[İI]LER[İI][\s\S]{0,200}/i);
    if (aliciBilgileriMatch) {
      const section = aliciBilgileriMatch[0];
      // Find the first meaningful name in this section
      const lines = section.split(/[\n\r]+/).filter(l => l.trim().length > 0);
      for (const line of lines) {
        const cleaned = line.trim()
          .replace(/^ALICI\s*B[İI]LG[İI]LER[İI]/i, '')
          .replace(/^(BİLGİLER|BILGILER|ALICI|Alıcı)/i, '')
          .replace(/^[:\s]+/, '')
          .trim();

        // A line with at least 2 words and letters can be a name
        if (cleaned.length > 3 && /[a-zA-ZğüşıöçĞÜŞİÖÇ]{2,}/i.test(cleaned) && !/^(Ad[ıi]|Soyad|Unvan|VKN|TCKN|Adres|Vergi|Daire)/i.test(cleaned)) {
          fullClientInfo = cleaned;
          break;
        }
      }
    }

    // Alternatif pattern'ler
    if (!fullClientInfo) {
      const clientPatterns = [
        // GIB e-SMM spesifik formatlar - daha esnek
        /Ad[ıi]\s*Soyad[ıi]\s*[\/\\]?\s*Unvan[ıi]?\s*[:\s]*([^\n\r]+)/i,
        /Ad[ıi]\s*Soyad[ıi]\s*[:\s]*([^\n\r]+)/i,
        /Unvan[ıi]?\s*[:\s]*([A-Za-zğüşıöçĞÜŞİÖÇ\s]+)/i,
        // Direkt isim pattern'leri
        /(?:^|\n)\s*([A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s*(?:\n|$)/m,
        // English names - 2-3 words starting with a capital
        /([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
        // Name after the ALICI row
        /ALICI[:\s]*\n?\s*([A-Za-zğüşıöçĞÜŞİÖÇ][A-Za-zğüşıöçĞÜŞİÖÇ\s]{2,40})/i,
        // Client
        /Müşteri[:\s]*([^\n\r]+)/i,
        /Alıcı\s*Adı[:\s]*([^\n\r]+)/i,
        /Client[:\s]*([^\n\r]+)/i,
        /Customer[:\s]*([^\n\r]+)/i,
        /Bill\s*To[:\s]*([^\n\r]+)/i,
      ];

      for (const pattern of clientPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const candidate = match[1].trim().replace(/^[:\s]+/, '').replace(/\s+/g, ' ');
          // Skip invalid values
          if (candidate.length > 2 &&
              !/^(BİLGİLER|BILGILER|ALICI|VKN|TCKN|Vergi|Adres|Tarih|\d)/i.test(candidate)) {
            fullClientInfo = candidate;
            break;
          }
        }
      }
    }

    // Last resort: search for 2-3 word capitalized names in the text
    if (!fullClientInfo) {
      // Exclude platform names like Upwork, Fiverr
      const namePattern = /(?:^|\n)\s*([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(?:\n|$)/gm;
      const excludeWords = ['Freelance', 'Service', 'Payment', 'Invoice', 'Total', 'Amount', 'Upwork', 'Fiverr', 'United', 'States', 'Kingdom'];
      let match;
      while ((match = namePattern.exec(text)) !== null) {
        const candidate = match[1].trim();
        const words = candidate.split(/\s+/);
        const isValid = words.length >= 2 &&
                        words.every(w => w.length >= 2 && !excludeWords.includes(w)) &&
                        !/\d/.test(candidate);
        if (isValid) {
          fullClientInfo = candidate;
          break;
        }
      }
    }

    if (fullClientInfo) {
      // Remove unnecessary leading words and characters
      fullClientInfo = fullClientInfo
        .replace(/^(BİLGİLER|BILGILER|BİLGİ|BILGI|ALICI|Alıcı|Ad[ıi]\s*Soyad[ıi]\s*[\/\\]?\s*Unvan[ıi]?)/gi, '')
        .replace(/^[iİıI]\s+/i, '') // Remove leading single 'i' character
        .replace(/^[:\s]+/, '') // Remove leading colons and spaces
        .trim();

      // Take only the name part - first 2-4 words are usually the name
      // Strip address, city, country info
      const words = fullClientInfo.split(/\s+/);
      const nameWords = [];

      for (const word of words) {
        // Stop if contains a number or address keywords
        if (/^\d/.test(word) || /^(Street|St\.|Ave|Avenue|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Place|Pl|Court|Ct|Chemin|Rue|Strasse|Straße|No\.|Apt|Suite|Floor|Unit)/i.test(word)) {
          break;
        }
        // Country or city names usually appear at the end
        if (nameWords.length >= 2 && /^(United|USA|UK|Germany|France|Netherlands|Switzerland|Canada|Australia|Belgium|Austria|Ireland|Spain|Italy|Sweden|Norway|Denmark|Finland|Poland|Czech|Hungary|Romania|Bulgaria|Greece|Portugal|Turkey|India|China|Japan|Korea|Singapore|Hong|Dubai|UAE|Saudi|Israel|Brazil|Mexico|Argentina|Chile|Colombia|Peru)/i.test(word)) {
          break;
        }
        // VKN, TCKN gibi teknik terimleri atla
        if (/^(VKN|TCKN|Vergi|Daire|Adres)/i.test(word)) {
          break;
        }
        nameWords.push(word);
        // Genelde 4 kelimeden fazla isim olmaz
        if (nameWords.length >= 4) break;
      }

      client = nameWords.join(' ').trim();
      if (client.length < 2) client = null;
    }

    if (!client) {
      errors.push('Client name not found');
      client = 'Unknown';
    }

    // Extract country info - only from the ALICI BİLGİLERİ section
    let country = '';

    // First find the ALICI BİLGİLERİ section
    const aliciSection = text.match(/ALICI\s*B[İI]LG[İI]LER[İI][\s\S]{0,500}/i);
    let searchText = aliciSection ? aliciSection[0] : '';

    // If no ALICI section, look at the 200 chars after the client name
    if (!searchText && fullClientInfo) {
      const clientIndex = text.indexOf(fullClientInfo);
      if (clientIndex !== -1) {
        searchText = text.substring(clientIndex, clientIndex + 300);
      }
    }

    // If still not found, search the full text but skip Turkey
    if (!searchText) {
      searchText = text;
    }

    const countryPatterns = [
      // First search for country with specific labels (highest priority)
      /(?:Ülke|Ulke|Country|Nation|País|Pays|Land)[:\s]+([A-Za-zÀ-ÿ\s\-]+?)(?:\n|$|[,;])/i,
      /(?:Country|Ülke|Ulke)[:\s]*\n?\s*([A-Za-zÀ-ÿ\s\-]+?)(?:\n|$)/i,
      // Country in the address line
      /(?:Address|Adres)[:\s]*[^\n]*[\n\r]+[^\n]*[\n\r]+[^\n]*?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$/im,
      // Full country names (excluding Turkey - appears everywhere in GIB format)
      /\b(United States of America|United States|United Kingdom|USA|UK|Germany|Deutschland|France|Netherlands|Holland|Switzerland|Schweiz|Canada|Australia|Belgium|Belgique|Austria|Österreich|Ireland|Spain|España|Italy|Italia|Sweden|Sverige|Norway|Norge|Denmark|Danmark|Finland|Suomi|Poland|Polska|Czech Republic|Czechia|Hungary|Romania|Bulgaria|Greece|Portugal|India|China|Japan|South Korea|Korea|Singapore|Hong Kong|Dubai|UAE|United Arab Emirates|Saudi Arabia|Israel|Brazil|Brasil|Mexico|México|Argentina|Chile|Colombia|Peru)\b/i,
      // Abbreviations (excluding TR)
      /\b(US|GB|DE|FR|NL|CH|CA|AU|BE|AT|IE|ES|IT|SE|NO|DK|FI|PL|CZ|HU|RO|BG|GR|PT|IN|CN|JP|KR|SG|HK|AE|SA|IL|BR|MX|AR|CL|CO|PE)\b/,
    ];

    for (const pattern of countryPatterns) {
      const match = searchText.match(pattern);
      if (match) {
        country = (match[1] || match[0]).trim();

        // Clean invalid values
        if (/^(bilgi|info|n\/a|none|-|\.|\s*|turkey|türkiye|tr)$/i.test(country)) {
          continue;
        }

        // Convert short codes and alternative names to full names - MUST match world-atlas names
        const countryMap = {
          'US': 'United States', 'USA': 'United States', 'United States of America': 'United States',
          'GB': 'United Kingdom', 'UK': 'United Kingdom',
          'DE': 'Germany', 'Deutschland': 'Germany',
          'FR': 'France',
          'NL': 'Netherlands', 'Holland': 'Netherlands',
          'CH': 'Switzerland', 'Schweiz': 'Switzerland',
          'CA': 'Canada',
          'AU': 'Australia',
          'BE': 'Belgium', 'Belgique': 'Belgium',
          'AT': 'Austria', 'Österreich': 'Austria',
          'IE': 'Ireland',
          'ES': 'Spain', 'España': 'Spain',
          'IT': 'Italy', 'Italia': 'Italy',
          'SE': 'Sweden', 'Sverige': 'Sweden',
          'NO': 'Norway', 'Norge': 'Norway',
          'DK': 'Denmark', 'Danmark': 'Denmark',
          'FI': 'Finland', 'Suomi': 'Finland',
          'PL': 'Poland', 'Polska': 'Poland',
          'CZ': 'Czech Republic', 'Czech': 'Czech Republic', 'Czechia': 'Czech Republic',
          'HU': 'Hungary',
          'RO': 'Romania',
          'BG': 'Bulgaria',
          'GR': 'Greece',
          'PT': 'Portugal',
          'IN': 'India',
          'CN': 'China',
          'JP': 'Japan',
          'KR': 'South Korea', 'Korea': 'South Korea',
          'SG': 'Singapore',
          'HK': 'Hong Kong',
          'AE': 'United Arab Emirates', 'UAE': 'United Arab Emirates', 'Dubai': 'United Arab Emirates',
          'SA': 'Saudi Arabia',
          'IL': 'Israel',
          'BR': 'Brazil', 'Brasil': 'Brazil',
          'MX': 'Mexico', 'México': 'Mexico',
          'AR': 'Argentina',
          'CL': 'Chile',
          'CO': 'Colombia',
          'PE': 'Peru'
        };
        country = countryMap[country] || country;

        // If a valid country was found, break out of the loop
        if (country && country.length > 1) {
          console.log('Found country:', country, 'in section:', aliciSection ? 'ALICI' : 'other');
          break;
        }
      }
    }

    if (!country) {
      country = '-';
    }

    // USD Amount - extended patterns
    let amountUSD = 0;
    const usdPatterns = [
      // e-SMM specific formats - GIB format
      /Vergiler Dahil Toplam[:\s]*([\d.,\s]+)\s*USD/i,
      /Ödenecek Tutar[:\s]*([\d.,\s]+)\s*USD/i,
      /Net Alınan(?:\s+Toplam)?[:\s]*([\d.,\s]+)\s*USD/i,
      /Toplam(?:\s+Tutar)?[:\s]*([\d.,\s]+)\s*USD/i,
      /Mal Hizmet Toplam Tutarı[:\s]*([\d.,\s]+)\s*USD/i,
      /Hizmet Bedeli[:\s]*([\d.,\s]+)\s*USD/i,
      /Brüt Ücret[:\s]*([\d.,\s]+)\s*USD/i,
      /Makbuz Tutarı[:\s]*([\d.,\s]+)\s*USD/i,
      /Alınan Ücret[:\s]*([\d.,\s]+)\s*USD/i,
      /Ücret[:\s]*([\d.,\s]+)\s*USD/i,
      /Bedel[:\s]*([\d.,\s]+)\s*USD/i,
      /Tutar[:\s]*([\d.,\s]+)\s*USD/i,
      /Miktar[:\s]*([\d.,\s]+)\s*USD/i,
      // Upwork / Freelancer spesifik
      /(?:Amount|Total|Fee|Payment|Invoice Total|Grand Total)[:\s]*([\d.,\s]+)\s*USD/i,
      /(?:Net|Gross)[:\s]*([\d.,\s]+)\s*USD/i,
      // Formats where USD comes first
      /USD[:\s]*([\d.,\s]+)/i,
      /\$[:\s]*([\d.,\s]+)/,
      // USD sonra gelen formatlar (daha esnek)
      /([\d]+[\s.,]*[\d]*)\s*USD/i,
      /([\d.,]+)\s*USD/i,
      /([\d.,]+)\s*\$/,
    ];

    // Helper function for parsing numbers
    const parseNumber = (str) => {
      if (!str) return 0;
      // Remove spaces
      let numStr = str.replace(/\s/g, '');
      // If dot is the thousands separator (1.234,56)
      if (numStr.includes(',') && numStr.indexOf('.') < numStr.indexOf(',')) {
        numStr = numStr.replace(/\./g, '').replace(',', '.');
      }
      // If comma is the thousands separator (1,234.56)
      else if (numStr.includes('.') && numStr.indexOf(',') < numStr.indexOf('.')) {
        numStr = numStr.replace(/,/g, '');
      }
      // Only comma present (548,33)
      else if (numStr.includes(',') && !numStr.includes('.')) {
        numStr = numStr.replace(',', '.');
      }
      return parseFloat(numStr) || 0;
    };

    for (const pattern of usdPatterns) {
      const match = text.match(pattern);
      if (match) {
        const parsed = parseNumber(match[1]);
        if (parsed > 0 && parsed < 100000) {
          amountUSD = parsed;
          break;
        }
      }
    }

    // If USD still not found, locate "USD" in text and grab the nearest number
    if (amountUSD === 0) {
      const usdIndex = text.toUpperCase().indexOf('USD');
      if (usdIndex !== -1) {
        // Look 100 chars before and after USD (wider search)
        const searchRange = text.substring(Math.max(0, usdIndex - 100), usdIndex + 100);
        const numbersInRange = searchRange.match(/[\d.,]+/g);
        if (numbersInRange) {
          for (const numStr of numbersInRange) {
            // Search for numbers with at least 1 digit
            if (numStr.length >= 1) {
              let cleaned = numStr;
              if (cleaned.includes(',') && cleaned.indexOf('.') < cleaned.indexOf(',')) {
                cleaned = cleaned.replace(/\./g, '').replace(',', '.');
              } else if (cleaned.includes('.') && cleaned.indexOf(',') < cleaned.indexOf('.')) {
                cleaned = cleaned.replace(/,/g, '');
              } else if (cleaned.includes(',') && !cleaned.includes('.')) {
                cleaned = cleaned.replace(',', '.');
              }
              const parsed = parseFloat(cleaned);
              if (!isNaN(parsed) && parsed > 0 && parsed < 100000) {
                amountUSD = parsed;
                break;
              }
            }
          }
        }
      }
    }

    // Last resort: scan all numbers in the text and find a reasonable USD amount
    if (amountUSD === 0) {
      // Find all decimal numbers
      const allNumbers = text.match(/(\d+[.,]\d{2})/g);
      if (allNumbers) {
        for (const numStr of allNumbers) {
          let cleaned = numStr.replace(',', '.');
          const parsed = parseFloat(cleaned);
          // Reasonable USD range: 1-50000
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 50000) {
            amountUSD = parsed;
            break;
          }
        }
      }
    }

    if (amountUSD === 0) {
      errors.push('USD amount not found');
    }

    // TRY Tutar
    let amountTRY = 0;
    const tryPatterns = [
      /Net Alınan(?:\s+Toplam)?[:\s]*([\d.,]+)\s*(?:TL|TRY|₺)/i,
      /Toplam(?:\s+Tutar)?[:\s]*([\d.,]+)\s*(?:TL|TRY|₺)/i,
      /([\d]+[.,][\d]{2})\s*(?:TL|TRY|₺)/,
      /([\d.,]+)\s*(?:TL|TRY|₺)/,
    ];

    for (const pattern of tryPatterns) {
      const match = text.match(pattern);
      if (match) {
        let numStr = match[1];
        if (numStr.includes(',') && numStr.indexOf('.') < numStr.indexOf(',')) {
          numStr = numStr.replace(/\./g, '').replace(',', '.');
        } else if (numStr.includes('.') && numStr.indexOf(',') < numStr.indexOf('.')) {
          numStr = numStr.replace(/,/g, '');
        } else if (numStr.includes(',') && !numStr.includes('.')) {
          numStr = numStr.replace(',', '.');
        }

        const parsed = parseFloat(numStr);
        if (!isNaN(parsed) && parsed > 0) {
          amountTRY = parsed;
          break;
        }
      }
    }

    // Description / Service
    let description = 'Freelance Service';
    const descPatterns = [
      /Mal\/Hizmet Cinsi[:\s]*([^\n\r]+)/i,
      /Hizmet(?:\s+Açıklaması)?[:\s]*([^\n\r]+)/i,
      /Açıklama[:\s]*([^\n\r]+)/i,
      /Description[:\s]*([^\n\r]+)/i,
    ];

    for (const pattern of descPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        description = match[1].trim().substring(0, 100);
        break;
      }
    }


    return {
      invoiceNo,
      date,
      client,
      country,
      amountUSD,
      amountTRY,
      errors
    };
  };

  // Select folder
  const selectFolder = async () => {
    const selected = await open({
      directory: true,
      title: 'Select Invoice Folder'
    });
    if (selected) {
      setBasePath(selected);
      localStorage.setItem('invoiceBasePath', selected);
    }
  };

  // Clear folder path
  const clearPath = () => {
    setBasePath('');
    localStorage.removeItem('invoiceBasePath');
  };

  // Clear all data
  const clearAllData = async () => {
    const confirmed = await ask('Are you sure you want to delete all invoice data?\n\nThis action cannot be undone!', {
      title: 'Delete Data',
      kind: 'warning',
      okLabel: 'Yes, Delete',
      cancelLabel: 'Cancel'
    });

    if (confirmed) {
      setInvoices([]);
      localStorage.removeItem('invoices');
    }
  };

  // Scan folder for PDFs
  const scanFolder = async () => {
    if (!basePath) {
      await selectFolder();
      return;
    }

    setIsScanning(true);
    setScanProgress({ phase: 'searching', total: 0, current: 0, currentFile: '', success: [], failed: [] });

    const existingIds = new Set(invoices.map(inv => inv.invoiceNo));
    const pdfFiles = [];

    // Phase 1: Find all PDF files
    const findPDFs = async (dirPath, depth = 0) => {
      if (depth > 10) return;

      try {
        const entries = await readDir(dirPath);

        for (const entry of entries) {
          const entryPath = `${dirPath}/${entry.name}`;
          const entryName = entry.name || '';

          if (entryName.toUpperCase().startsWith('GIB') && entryName.toLowerCase().endsWith('.pdf')) {
            const invoiceNo = entryName.replace('.pdf', '');
            if (!existingIds.has(invoiceNo)) {
              pdfFiles.push({ path: entryPath, name: entryName, invoiceNo, dirPath });
              setScanProgress(prev => ({ ...prev, total: pdfFiles.length, currentFile: entryName }));
            }
          } else if (!entryName.includes('.') || entry.isDirectory) {
            await findPDFs(entryPath, depth + 1);
          }
        }
      } catch (err) {
        console.error(`Error scanning ${dirPath}:`, err);
      }
    };

    await findPDFs(basePath);

    if (pdfFiles.length === 0) {
      setIsScanning(false);
      setScanProgress({ phase: '', total: 0, current: 0, currentFile: '', success: [], failed: [] });
      alert('No new invoices found.\nMake sure the folder contains PDF files starting with GIB.');
      return;
    }

    // Phase 2: Read and parse each PDF
    setScanProgress(prev => ({ ...prev, phase: 'reading', current: 0 }));
    const newInvoices = [];
    const successList = [];
    const failedList = [];

    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      setScanProgress(prev => ({
        ...prev,
        current: i + 1,
        currentFile: file.name
      }));

      const isGelir = file.dirPath.toLowerCase().includes('gelir');
      const pathParts = file.dirPath.split(/[\/\\]/);
      let defaultDate = new Date().toISOString().split('T')[0];
      let year = new Date().getFullYear();

      for (const part of pathParts) {
        if (/^20\d{2}$/.test(part)) {
          year = parseInt(part);
          break;
        }
      }

      const monthNames = {
        'ocak': '01', 'şubat': '02', 'mart': '03', 'nisan': '04',
        'mayıs': '05', 'mayis': '05', 'haziran': '06', 'temmuz': '07',
        'ağustos': '08', 'agustos': '08', 'eylül': '09', 'eylul': '09',
        'ekim': '10', 'kasım': '11', 'kasim': '11', 'aralık': '12', 'aralik': '12'
      };

      for (const part of pathParts) {
        const lower = part.toLowerCase();
        for (const [monthName, monthNum] of Object.entries(monthNames)) {
          if (lower.includes(monthName)) {
            defaultDate = `${year}-${monthNum}-15`;
            break;
          }
        }
      }

      let parsedData = null;
      let readSuccess = false;
      let failReason = '';

      try {
        let pdfData = await readFile(file.path);
        const extractResult = await extractPdfText(pdfData);
        // Free memory
        pdfData = null;

        if (extractResult.error) {
          failReason = `PDF read error: ${extractResult.error}`;
        } else if (!extractResult.text || extractResult.text.length < 10) {
          failReason = `PDF content empty (${extractResult.text?.length || 0} characters)`;
        } else {
          parsedData = parseInvoiceText(extractResult.text, file.name);

          if (parsedData) {
            // Success criterion: PDF was readable and date was found
            // Even if USD is 0 it can be edited manually
            readSuccess = parsedData.amountUSD > 0;

            // Even if USD not found, it was at least parsed - add to invoice list
            if (!readSuccess && parsedData.client !== 'Unknown') {
              // Partial success if client found - still added to list
              failReason = `Amount not found - Manual edit required`;
            } else if (!readSuccess) {
              failReason = `USD amount not found`;
            }
          } else {
            failReason = 'Could not parse PDF';
          }
        }
      } catch (readErr) {
        console.error(`Error reading PDF ${file.name}:`, readErr);
        failReason = `Error: ${readErr.message || 'Could not read file'}`;
      }

      // Short wait every 5 PDFs (for memory cleanup)
      if (i > 0 && i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const newInvoice = {
        id: file.invoiceNo + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        invoiceNo: file.invoiceNo,
        date: parsedData?.date || defaultDate,
        client: parsedData?.client || 'Unknown',
        country: parsedData?.country || '-',
        amountUSD: parsedData?.amountUSD || 0,
        fileName: file.name,
        filePath: file.path,
        type: isGelir ? 'income' : 'unknown',
        needsEdit: !readSuccess
      };

      newInvoices.push(newInvoice);

      if (readSuccess) {
        successList.push({
          name: file.name,
          amount: parsedData.amountUSD,
          client: parsedData.client,
          country: parsedData.country,
          date: parsedData.date
        });
      } else {
        failedList.push({ name: file.name, reason: failReason });
      }

      setScanProgress(prev => ({
        ...prev,
        success: [...successList],
        failed: [...failedList]
      }));
    }

    if (newInvoices.length > 0) {
      setInvoices(prev => [...prev, ...newInvoices]);
    }

    // Keep progress visible for a moment before clearing
    setTimeout(() => {
      setIsScanning(false);
      setScanProgress({ phase: '', total: 0, current: 0, currentFile: '', success: [], failed: [] });
    }, 2000);
  };

  // Add manual entry
  const addManualEntry = () => {
    if (!manualEntry.client || !manualEntry.amountUSD) return;

    const newInvoice = {
      id: 'manual_' + Date.now(),
      invoiceNo: manualEntry.invoiceNo || 'MANUAL-' + Date.now(),
      date: manualEntry.date,
      client: manualEntry.client,
      description: manualEntry.description || 'Freelance Service',
      amountUSD: parseFloat(manualEntry.amountUSD),
      amountTRY: parseFloat(manualEntry.amountTRY) || 0,
      type: 'income',
      manual: true
    };

    setInvoices(prev => [...prev, newInvoice]);
    setManualEntry({
      date: new Date().toISOString().split('T')[0],
      client: '',
      description: '',
      amountUSD: '',
      amountTRY: '',
      invoiceNo: ''
    });
    setView('list');
  };

  // Edit invoice
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const startEdit = (invoice) => {
    setEditingId(invoice.id);
    setEditForm({
      client: invoice.client,
      country: invoice.country || '',
      amountUSD: invoice.amountUSD.toString()
    });
  };

  const saveEdit = (id) => {
    setInvoices(prev => prev.map(inv =>
      inv.id === id ? {
        ...inv,
        client: editForm.client,
        country: editForm.country,
        amountUSD: parseFloat(editForm.amountUSD) || 0,
        needsEdit: false
      } : inv
    ));
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  // Delete invoice
  const deleteInvoice = (id) => {
    setInvoices(prev => prev.filter(inv => inv.id !== id));
  };

  // Filter invoices
  const filteredInvoices = invoices.filter(inv => {
    const invYear = inv.date.split('-')[0];
    const invMonth = inv.date.split('-')[1];

    if (selectedYear !== 'all' && invYear !== selectedYear) return false;
    if (selectedMonth !== 'all' && invMonth !== selectedMonth) return false;

    return true;
  });

  // Calculate stats
  // Group all invoices by year (without filter)
  const allByYear = invoices.reduce((acc, inv) => {
    const year = inv.date.split('-')[0];
    if (!acc[year]) acc[year] = { total: 0, count: 0, byMonth: {} };
    acc[year].total += inv.amountUSD;
    acc[year].count += 1;
    const month = inv.date.substring(5, 7);
    acc[year].byMonth[month] = (acc[year].byMonth[month] || 0) + inv.amountUSD;
    return acc;
  }, {});

  const stats = {
    totalUSD: filteredInvoices.reduce((sum, inv) => sum + inv.amountUSD, 0),
    totalTRY: filteredInvoices.reduce((sum, inv) => sum + inv.amountTRY, 0),
    invoiceCount: filteredInvoices.length,
    avgPerInvoice: filteredInvoices.length > 0
      ? filteredInvoices.reduce((sum, inv) => sum + inv.amountUSD, 0) / filteredInvoices.length
      : 0,
    byClient: filteredInvoices.reduce((acc, inv) => {
      acc[inv.client] = (acc[inv.client] || 0) + inv.amountUSD;
      return acc;
    }, {}),
    byMonth: filteredInvoices.reduce((acc, inv) => {
      const month = inv.date.substring(0, 7);
      acc[month] = (acc[month] || 0) + inv.amountUSD;
      return acc;
    }, {}),
    byCountry: filteredInvoices.reduce((acc, inv) => {
      const country = inv.country || '-';
      acc[country] = (acc[country] || 0) + inv.amountUSD;
      return acc;
    }, {}),
    byYear: allByYear
  };

  // Calculate trend (compared to previous period)
  const calculateTrend = () => {
    if (selectedYear === 'all' || selectedMonth === 'all') return null;

    const currentMonthKey = `${selectedYear}-${selectedMonth}`;
    const currentAmount = stats.byMonth[currentMonthKey] || 0;

    // Calculate previous month
    let prevMonth = parseInt(selectedMonth) - 1;
    let prevYear = parseInt(selectedYear);
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    const prevMonthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    // Previous month data (from all invoices)
    const prevAmount = invoices
      .filter(inv => inv.date.startsWith(prevMonthKey))
      .reduce((sum, inv) => sum + inv.amountUSD, 0);

    if (prevAmount === 0) return null;

    const change = ((currentAmount - prevAmount) / prevAmount) * 100;
    return { current: currentAmount, previous: prevAmount, change };
  };

  const trend = calculateTrend();

  // Get available years - include current year and all years from invoices
  const currentYear = new Date().getFullYear().toString();
  const invoiceYears = invoices.map(inv => inv.date.split('-')[0]);
  const allYears = [...new Set([currentYear, '2026', '2025', '2024', '2023', '2022', ...invoiceYears])].sort().reverse();
  const years = allYears;

  const months = [
    { value: 'all', label: 'All Months' },
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ];

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="income-tracker">
      {/* Header */}
      <div className="it-header">
        <div className="it-header-left">
          <h2>Income Tracker</h2>
          <div className="it-filters">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="it-select"
            >
              <option value="all">All Years</option>
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="it-select"
            >
              {months.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="it-header-right">
          <button
            className={`it-tab ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`it-tab ${view === 'list' ? 'active' : ''}`}
            onClick={() => setView('list')}
          >
            Invoices
          </button>
          <button
            className={`it-tab ${view === 'add' ? 'active' : ''}`}
            onClick={() => setView('add')}
          >
            + Add
          </button>
        </div>
      </div>

      {/* Scanning Progress Modal */}
      {isScanning && (
        <div className="it-scan-overlay">
          <div className="it-scan-modal">
            <h3>{scanProgress.phase === 'searching' ? 'Searching PDF Files...' : 'Reading PDF Files...'}</h3>

            {/* Progress Bar */}
            <div className="it-progress-section">
              <div className="it-progress-bar">
                <div
                  className="it-progress-fill"
                  style={{
                    width: scanProgress.total > 0
                      ? `${(scanProgress.current / scanProgress.total) * 100}%`
                      : '0%'
                  }}
                />
              </div>
              <div className="it-progress-text">
                {scanProgress.phase === 'searching'
                  ? `${scanProgress.total} files found`
                  : `${scanProgress.current} / ${scanProgress.total}`
                }
              </div>
              {scanProgress.currentFile && (
                <div className="it-current-file">{scanProgress.currentFile}</div>
              )}
            </div>

            {/* Results Summary */}
            {scanProgress.phase === 'reading' && (scanProgress.success.length > 0 || scanProgress.failed.length > 0) && (
              <div className="it-scan-results">
                {/* Success List */}
                {scanProgress.success.length > 0 && (
                  <div className="it-result-section success">
                    <h4>Read ({scanProgress.success.length})</h4>
                    <div className="it-result-list">
                      {scanProgress.success.slice(-5).map((item, idx) => (
                        <div key={idx} className="it-result-item success">
                          <span className="it-result-icon">✓</span>
                          <div className="it-result-details">
                            <span className="it-result-name">{item.name}</span>
                            <span className="it-result-meta">{item.client} • {item.date}</span>
                          </div>
                          <span className="it-result-amount">${item.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Failed List */}
                {scanProgress.failed.length > 0 && (
                  <div className="it-result-section failed">
                    <h4>Failed ({scanProgress.failed.length})</h4>
                    <div className="it-result-list">
                      {scanProgress.failed.slice(-5).map((item, idx) => (
                        <div key={idx} className="it-result-item failed">
                          <span className="it-result-icon">✕</span>
                          <span className="it-result-name">{item.name}</span>
                          <span className="it-result-reason">{item.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dashboard View */}
      {view === 'dashboard' && (
        <div className="it-dashboard">
          {/* Stats Cards */}
          <div className="it-stats-grid">
            <div className="it-stat-card primary">
              <div className="it-stat-icon">$</div>
              <div className="it-stat-content">
                <span className="it-stat-value">{formatCurrency(stats.totalUSD)}</span>
                <span className="it-stat-label">
                  {selectedYear !== 'all' && selectedMonth !== 'all'
                    ? `${months.find(m => m.value === selectedMonth)?.label} ${selectedYear} Income`
                    : selectedYear !== 'all'
                      ? `${selectedYear} Total Income`
                      : 'Total Income (USD)'}
                </span>
              </div>
            </div>
            <div className="it-stat-card">
              <div className="it-stat-icon">#</div>
              <div className="it-stat-content">
                <span className="it-stat-value">{stats.invoiceCount}</span>
                <span className="it-stat-label">
                  {selectedYear !== 'all' && selectedMonth !== 'all'
                    ? `${months.find(m => m.value === selectedMonth)?.label} ${selectedYear}`
                    : selectedYear !== 'all'
                      ? `${selectedYear} Invoices`
                      : 'Total Invoices'}
                </span>
              </div>
            </div>
            <div className="it-stat-card">
              <div className="it-stat-icon">%</div>
              <div className="it-stat-content">
                <span className="it-stat-value">
                  {invoices.filter(inv => inv.amountUSD > 0).length} / {invoices.length}
                </span>
                <span className="it-stat-label">Read / Total</span>
              </div>
            </div>
            {trend && (
              <div className={`it-stat-card ${trend.change >= 0 ? 'positive' : 'negative'}`}>
                <div className="it-stat-icon">{trend.change >= 0 ? '↑' : '↓'}</div>
                <div className="it-stat-content">
                  <span className="it-stat-value">{trend.change >= 0 ? '+' : ''}{trend.change.toFixed(1)}%</span>
                  <span className="it-stat-label">vs. Previous Month</span>
                </div>
              </div>
            )}
          </div>

          {/* Charts Section - Row 1: Main Chart */}
          <div className="it-charts">
            <div className="it-chart-card wide">
              <div className="it-chart-header">
                <h3>Income Chart</h3>
                <div className="it-chart-controls">
                  {/* Monthly/Yearly Selection */}
                  <div className="it-chart-mode-selector">
                    <button
                      className={`it-mode-btn ${chartMode === 'monthly' ? 'active' : ''}`}
                      onClick={() => setChartMode('monthly')}
                    >
                      Monthly
                    </button>
                    <button
                      className={`it-mode-btn ${chartMode === 'yearly' ? 'active' : ''}`}
                      onClick={() => setChartMode('yearly')}
                    >
                      Yearly
                    </button>
                  </div>
                  {/* Year Selection (monthly mode only) */}
                  {chartMode === 'monthly' && (
                    <div className="it-chart-year-selector">
                      {years.filter(y => y !== 'all').slice(0, 5).map(year => (
                        <button
                          key={year}
                          className={`it-year-btn ${chartYear === year ? 'active' : ''}`}
                          onClick={() => setChartYear(year)}
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Mountain-shaped Bar Chart */}
              <div className="it-mountain-chart">
                {(() => {
                  let chartData = [];
                  let totalAmount = 0;

                  if (chartMode === 'monthly') {
                    // Monthly veri
                    const yearData = stats.byYear[chartYear]?.byMonth || {};
                    chartData = months.slice(1).map(m => ({
                      label: m.label.substring(0, 3),
                      value: yearData[m.value] || 0
                    }));
                    totalAmount = Object.values(yearData).reduce((a, b) => a + b, 0);
                  } else {
                    // Yearly data
                    chartData = Object.entries(stats.byYear)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([year, data]) => ({
                        label: year,
                        value: data.total
                      }));
                    totalAmount = chartData.reduce((sum, d) => sum + d.value, 0);
                  }

                  const maxVal = Math.max(...chartData.map(d => d.value), 1);
                  const hasData = chartData.some(d => d.value > 0);

                  return hasData ? (
                    <>
                      <div className="it-mountain-bars">
                        {chartData.map((d, i) => {
                          const height = (d.value / maxVal) * 100;
                          return (
                            <div key={i} className="it-mountain-col">
                              <div className="it-mountain-value">
                                {d.value > 0 ? formatCurrency(d.value) : ''}
                              </div>
                              <div className="it-mountain-bar-wrapper">
                                <div
                                  className={`it-mountain-bar ${d.value > 0 ? 'has-value' : ''}`}
                                  style={{ height: `${Math.max(height, 2)}%` }}
                                />
                              </div>
                              <div className="it-mountain-label">{d.label}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="it-chart-total">
                        Total: {formatCurrency(totalAmount)}
                      </div>
                    </>
                  ) : (
                    <div className="it-empty">{chartMode === 'monthly' ? `No data for ${chartYear}` : 'No data yet'}</div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Client Filter and Top Clients */}
          <div className="it-charts">
            <div className="it-chart-card wide">
              <div className="it-chart-header">
                <h3>Total Income by Client</h3>
                <div className="it-client-filter">
                  <select
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                    className="it-client-select"
                  >
                    <option value="all">All Clients</option>
                    {Object.entries(stats.byClient)
                      .sort((a, b) => b[1] - a[1])
                      .map(([client]) => (
                        <option key={client} value={client}>{client}</option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Client Ranking */}
              <div className="it-client-ranking">
                {Object.entries(stats.byClient)
                  .sort((a, b) => b[1] - a[1])
                  .filter(([client]) => clientFilter === 'all' || client === clientFilter)
                  .slice(0, 10)
                  .map(([client, amount], i) => {
                    const maxClientAmount = Math.max(...Object.values(stats.byClient), 1);
                    const percentage = (amount / stats.totalUSD) * 100;
                    return (
                      <div key={client} className="it-client-row">
                        <span className="it-client-rank">#{i + 1}</span>
                        <span className="it-client-name">{client}</span>
                        <div className="it-client-bar-container">
                          <div
                            className="it-client-bar-fill"
                            style={{ width: `${(amount / maxClientAmount) * 100}%` }}
                          />
                        </div>
                        <span className="it-client-amount">{formatCurrency(amount)}</span>
                        <span className="it-client-percent">{percentage.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                {Object.keys(stats.byClient).length === 0 && (
                  <div className="it-empty">No client data yet</div>
                )}
              </div>
            </div>
          </div>

          {/* Charts Section - Row 2 */}
          <div className="it-charts">
            {/* Year Comparison */}
            <div className="it-chart-card">
              <h3>Yearly Comparison</h3>
              <div className="it-bar-chart">
                {Object.entries(stats.byYear)
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .slice(0, 4)
                  .map(([year, data]) => {
                    const maxYearTotal = Math.max(...Object.values(stats.byYear).map(d => d.total), 1);
                    return (
                      <div key={year} className="it-bar-row">
                        <span className="it-bar-label">{year}</span>
                        <div className="it-bar-container">
                          <div
                            className="it-bar-fill"
                            style={{ width: `${(data.total / maxYearTotal) * 100}%` }}
                          />
                        </div>
                        <span className="it-bar-value">{formatCurrency(data.total)}</span>
                      </div>
                    );
                  })}
                {Object.keys(stats.byYear).length === 0 && (
                  <div className="it-empty">No data yet</div>
                )}
              </div>
            </div>

            {/* By Client */}
            <div className="it-chart-card">
              <h3>Income by Client</h3>
              <div className="it-bar-chart">
                {Object.entries(stats.byClient)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([client, amount]) => (
                    <div key={client} className="it-bar-row">
                      <span className="it-bar-label">{client}</span>
                      <div className="it-bar-container">
                        <div
                          className="it-bar-fill"
                          style={{ width: `${(amount / stats.totalUSD) * 100}%` }}
                        />
                      </div>
                      <span className="it-bar-value">{formatCurrency(amount)}</span>
                    </div>
                  ))}
                {Object.keys(stats.byClient).length === 0 && (
                  <div className="it-empty">No data yet</div>
                )}
              </div>
            </div>
          </div>

          {/* Charts Section - Row 3 */}
          <div className="it-charts">
            {/* Country Distribution - Pie Chart Style */}
            <div className="it-chart-card">
              <h3>Country Distribution</h3>
              <div className="it-pie-chart">
                {(() => {
                  const countryData = Object.entries(stats.byCountry)
                    .filter(([c]) => c !== '-')
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6);
                  const colors = ['#667eea', '#764ba2', '#f093fb', '#4ade80', '#fbbf24', '#60a5fa'];

                  return countryData.length > 0 ? (
                    <div className="it-pie-rows">
                      {countryData.map(([country, amount], i) => (
                        <div key={country} className="it-pie-row">
                          <span className="it-pie-dot" style={{ background: colors[i % colors.length] }} />
                          <span className="it-pie-label">{country}</span>
                          <span className="it-pie-value">{formatCurrency(amount)}</span>
                          <span className="it-pie-percent">
                            {((amount / stats.totalUSD) * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="it-empty">No data yet</div>
                  );
                })()}
              </div>
            </div>

            {/* Monthly Comparison for Selected Year */}
            <div className="it-chart-card">
              <h3>
                {selectedYear !== 'all' ? `${selectedYear} Monthly Distribution` : 'Monthly Distribution'}
              </h3>
              <div className="it-mini-bars">
                {(() => {
                  const yearData = selectedYear !== 'all'
                    ? stats.byYear[selectedYear]?.byMonth || {}
                    : {};
                  const maxMonthVal = Math.max(...Object.values(yearData), 1);

                  return Object.keys(yearData).length > 0 ? (
                    <div className="it-mini-bar-grid">
                      {months.slice(1).map((m) => {
                        const value = yearData[m.value] || 0;
                        const height = (value / maxMonthVal) * 100;
                        return (
                          <div key={m.value} className="it-mini-bar-col">
                            <div className="it-mini-bar-wrapper">
                              <div
                                className="it-mini-bar-fill"
                                style={{ height: `${height}%` }}
                                title={formatCurrency(value)}
                              />
                            </div>
                            <span className="it-mini-bar-label">{m.label.substring(0, 1)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="it-empty">Select year</div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="it-actions">
            <button
              className="it-action-btn primary"
              onClick={selectFolder}
              title="Select invoice folder"
            >
              📁 {basePath ? 'Change Folder' : 'Select Folder'}
            </button>
            {basePath && (
              <>
                <button
                  className="it-action-btn"
                  onClick={scanFolder}
                  disabled={isScanning}
                  title="Scan invoices"
                >
                  🔄 {isScanning ? 'Scanning...' : 'Refresh'}
                </button>
                <button
                  className="it-action-btn danger"
                  onClick={clearPath}
                  title="Remove folder link"
                >
                  ✕ Remove Folder
                </button>
              </>
            )}
            {invoices.length > 0 && (
              <button
                className="it-action-btn danger"
                onClick={clearAllData}
                title="Delete all data"
              >
                🗑️ Delete All Data
              </button>
            )}
          </div>
          {basePath && (
            <div className="it-path-info">
              <span className="it-path-label">Selected Folder:</span>
              <span className="it-path">{basePath}</span>
            </div>
          )}
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="it-list-container">
          {/* Sort Options */}
          <div className="it-sort-controls">
            <span className="it-sort-label">Sort:</span>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="it-sort-select"
            >
              <option value="date-desc">Date (Newest First)</option>
              <option value="date-asc">Date (Oldest First)</option>
              <option value="amount-desc">Amount (High to Low)</option>
              <option value="amount-asc">Amount (Low to High)</option>
              <option value="client-asc">Client (A-Z)</option>
              <option value="client-desc">Client (Z-A)</option>
            </select>
          </div>

          {/* Read Invoices */}
          {(() => {
            // Sort function
            const sortInvoices = (invList) => {
              return [...invList].sort((a, b) => {
                switch (sortOrder) {
                  case 'date-desc':
                    return new Date(b.date) - new Date(a.date);
                  case 'date-asc':
                    return new Date(a.date) - new Date(b.date);
                  case 'amount-desc':
                    return b.amountUSD - a.amountUSD;
                  case 'amount-asc':
                    return a.amountUSD - b.amountUSD;
                  case 'client-asc':
                    return (a.client || '').localeCompare(b.client || '', 'tr');
                  case 'client-desc':
                    return (b.client || '').localeCompare(a.client || '', 'tr');
                  default:
                    return new Date(b.date) - new Date(a.date);
                }
              });
            };

            const readInvoices = sortInvoices(filteredInvoices.filter(inv => !inv.needsEdit));
            const unreadInvoices = sortInvoices(filteredInvoices.filter(inv => inv.needsEdit));

            const renderInvoiceRow = (invoice) => (
              <div key={invoice.id} className={`it-list-row ${invoice.needsEdit ? 'needs-edit' : ''}`}>
                {editingId === invoice.id ? (
                  <>
                    <span className="it-date">{formatDate(invoice.date)}</span>
                    <input
                      className="it-edit-input"
                      value={editForm.client}
                      onChange={(e) => setEditForm({...editForm, client: e.target.value})}
                      placeholder="Client"
                    />
                    <input
                      className="it-edit-input"
                      value={editForm.country}
                      onChange={(e) => setEditForm({...editForm, country: e.target.value})}
                      placeholder="Country"
                    />
                    <input
                      className="it-edit-input small"
                      type="number"
                      value={editForm.amountUSD}
                      onChange={(e) => setEditForm({...editForm, amountUSD: e.target.value})}
                      placeholder="USD"
                    />
                    <div className="it-edit-actions">
                      <button className="it-save-edit" onClick={() => saveEdit(invoice.id)}>✓</button>
                      <button className="it-cancel-edit" onClick={cancelEdit}>×</button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="it-date">{formatDate(invoice.date)}</span>
                    <span className="it-client">{invoice.client}</span>
                    <span className="it-country">{invoice.country || '-'}</span>
                    <span className="it-amount">{formatCurrency(invoice.amountUSD)}</span>
                    <div className="it-row-actions">
                      <button
                        className="it-edit-btn"
                        onClick={() => startEdit(invoice)}
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        className="it-delete-btn"
                        onClick={() => deleteInvoice(invoice.id)}
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  </>
                )}
              </div>
            );

            return (
              <>
                {/* Read Invoices */}
                {readInvoices.length > 0 && (
                  <div className={`it-list-section ${collapsedSections.read ? 'collapsed' : ''}`}>
                    <div
                      className="it-list-section-header success clickable"
                      onClick={() => setCollapsedSections(prev => ({...prev, read: !prev.read}))}
                    >
                      <span className={`it-section-arrow ${collapsedSections.read ? 'collapsed' : ''}`}>▼</span>
                      <span className="it-section-icon">✓</span>
                      <span>Read Invoices ({readInvoices.length})</span>
                      <span className="it-section-total">{formatCurrency(readInvoices.reduce((sum, inv) => sum + inv.amountUSD, 0))}</span>
                    </div>
                    {!collapsedSections.read && (
                      <div className="it-list">
                        <div className="it-list-header">
                          <span>Date</span>
                          <span>Client</span>
                          <span>Country</span>
                          <span>Amount (USD)</span>
                          <span></span>
                        </div>
                        <div className="it-list-body">
                          {readInvoices.map(renderInvoiceRow)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Unread Invoices */}
                {unreadInvoices.length > 0 && (
                  <div className={`it-list-section ${collapsedSections.unread ? 'collapsed' : ''}`}>
                    <div
                      className="it-list-section-header warning clickable"
                      onClick={() => setCollapsedSections(prev => ({...prev, unread: !prev.unread}))}
                    >
                      <span className={`it-section-arrow ${collapsedSections.unread ? 'collapsed' : ''}`}>▼</span>
                      <span className="it-section-icon">!</span>
                      <span>Unread Invoices ({unreadInvoices.length})</span>
                      <span className="it-section-hint">Click the pencil icon to edit</span>
                    </div>
                    {!collapsedSections.unread && (
                      <div className="it-list">
                        <div className="it-list-header">
                          <span>Date</span>
                          <span>Client</span>
                          <span>Country</span>
                          <span>Amount (USD)</span>
                          <span></span>
                        </div>
                        <div className="it-list-body">
                          {unreadInvoices.map(renderInvoiceRow)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {filteredInvoices.length === 0 && (
                  <div className="it-empty-list">
                    <p>No invoices yet</p>
                    <button onClick={() => setView('add')}>Add Manually</button>
                    <button onClick={scanFolder}>Scan from Folder</button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Add View */}
      {view === 'add' && (
        <div className="it-add-form">
          <h3>Add Manual Invoice</h3>
          <div className="it-form-grid">
            <div className="it-form-group">
              <label>Date</label>
              <input
                type="date"
                value={manualEntry.date}
                onChange={(e) => setManualEntry({...manualEntry, date: e.target.value})}
              />
            </div>
            <div className="it-form-group">
              <label>Invoice No (optional)</label>
              <input
                type="text"
                placeholder="GIB2025..."
                value={manualEntry.invoiceNo}
                onChange={(e) => setManualEntry({...manualEntry, invoiceNo: e.target.value})}
              />
            </div>
            <div className="it-form-group">
              <label>Client *</label>
              <input
                type="text"
                placeholder="Client name"
                value={manualEntry.client}
                onChange={(e) => setManualEntry({...manualEntry, client: e.target.value})}
              />
            </div>
            <div className="it-form-group">
              <label>Description</label>
              <input
                type="text"
                placeholder="Service description"
                value={manualEntry.description}
                onChange={(e) => setManualEntry({...manualEntry, description: e.target.value})}
              />
            </div>
            <div className="it-form-group">
              <label>Amount (USD) *</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={manualEntry.amountUSD}
                onChange={(e) => setManualEntry({...manualEntry, amountUSD: e.target.value})}
              />
            </div>
            <div className="it-form-group">
              <label>Amount (TRY)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={manualEntry.amountTRY}
                onChange={(e) => setManualEntry({...manualEntry, amountTRY: e.target.value})}
              />
            </div>
          </div>
          <div className="it-form-actions">
            <button className="it-save-btn" onClick={addManualEntry}>
              Save
            </button>
            <button className="it-cancel-btn" onClick={() => setView('list')}>
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default IncomeTracker;
