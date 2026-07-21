// Fetches latest SEBI Circulars from SEBI website
// URL: https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=7&smid=0
// Saves output to data/sebi-circulars.json
// Triggers real-time email alerts via email-notifier.mjs when new circulars are released.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { sendRegulatoryAlert } from "./email-notifier.mjs";

const DATA_PATH = new URL("../data/sebi-circulars.json", import.meta.url);
const SEBI_CIRCULAR_LIST_URL = "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=7&smid=0";

async function loadPreviousData() {
  try {
    const raw = await readFile(DATA_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { lastChecked: null, circulars: [] };
  }
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return await res.text();
}

/**
 * Extract detail information for a SEBI circular
 */
async function fetchCircularDetails(url) {
  try {
    const html = await fetchPage(url);

    // Title
    const h1Match = html.match(/<h1>\s*([\s\S]*?)\s*<\/h1>/i);
    const title = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";

    // Date
    const dateMatch = html.match(/class=\x27date_value\x27[^>]*>\s*<h5>([^<]+)<\/h5>/i) ||
                      html.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})/i);
    const date = dateMatch ? dateMatch[1].trim() : null;

    // PDF URL
    const pdfMatch = html.match(/iframe\s+src=\x27[^\x27]*?file=([^\x27&]+)/i) ||
                     html.match(/href=["\x27]?([^"\x27\s>]+\.pdf)/i);
    const pdfUrl = pdfMatch ? decodeURIComponent(pdfMatch[1]) : null;

    // Circular Number or Department
    const deptMatch = html.match(/class=\x27dept_value\x27[^>]*>\s*<h5>([^<]+)<\/h5>/i);
    const department = deptMatch ? deptMatch[1].trim() : null;

    return { title, date, pdfUrl, department };
  } catch (err) {
    console.warn(`Failed to fetch details for SEBI circular ${url}:`, err.message);
    return { title: "", date: null, pdfUrl: null, department: null };
  }
}

export async function checkSebiCirculars() {
  console.log("🔍 Checking SEBI Circulars...");
  const html = await fetchPage(SEBI_CIRCULAR_LIST_URL);

  const linkMatches = [...html.matchAll(/href="([^"]+\/legal\/circulars\/[^"]+)"/gi)];
  console.log(`Found ${linkMatches.length} raw SEBI circular links on listing page.`);

  const previousData = await loadPreviousData();
  const prevUrls = new Set(previousData.circulars.map(c => c.link));
  const newCirculars = [];
  const allParsed = [];

  for (const m of linkMatches) {
    const url = m[1];
    // ID from filename or link
    const idMatch = url.match(/_(\d+)\.html$/i);
    const id = idMatch ? `sebi-circ-${idMatch[1]}` : url;

    allParsed.push({ id, link: url });

    if (!prevUrls.has(url)) {
      console.log(`✨ New SEBI Circular detected: ${url}`);
      const details = await fetchCircularDetails(url);
      
      const fullItem = {
        id,
        link: url,
        title: details.title || "SEBI Circular",
        date: details.date || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        pdfUrl: details.pdfUrl,
        department: details.department,
        summary: details.title ? `Circular issued by SEBI: ${details.title}` : "New SEBI Circular released.",
        detectedAt: new Date().toISOString()
      };

      newCirculars.push(fullItem);
    }
  }

  // Combine and update stored data
  const updatedList = [
    ...newCirculars,
    ...previousData.circulars.filter(p => !newCirculars.some(n => n.id === p.id))
  ].slice(0, 100);

  const payload = {
    lastChecked: new Date().toISOString(),
    count: updatedList.length,
    circulars: updatedList
  };

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(payload, null, 2));
  console.log(`Updated data/sebi-circulars.json (${updatedList.length} total items).`);

  if (newCirculars.length > 0 && previousData.circulars.length > 0) {
    console.log(`🚨 Triggering INSTANT EMAIL ALERT for ${newCirculars.length} new SEBI circular(s)...`);
    await sendRegulatoryAlert({
      source: "SEBI",
      category: "Circular",
      updates: newCirculars.map(c => ({
        id: c.id,
        title: c.department ? `[${c.department}] ${c.title}` : c.title,
        link: c.link,
        pdfUrl: c.pdfUrl,
        date: c.date,
        summary: c.summary
      }))
    });
  } else if (previousData.circulars.length === 0) {
    console.log("Initialized SEBI circulars baseline data.");
  } else {
    console.log("No new SEBI circulars detected.");
  }

  return newCirculars;
}

if (process.argv[1] && process.argv[1].endsWith("fetch-sebi-circulars.mjs")) {
  checkSebiCirculars().catch(err => {
    console.error("Fatal error in checkSebiCirculars:", err);
    process.exit(1);
  });
}
