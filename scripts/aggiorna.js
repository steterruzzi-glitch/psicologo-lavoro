
const fs = require("node:fs");

const API =
  "https://portale.inpa.gov.it/concorsi-smart/api/concorso-public-area/search-better";

const PAGE_SIZE = 100;

function clean(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function initials(name) {
  return clean(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join("") || "PA";
}

async function fetchPage(page) {
  const response = await fetch(
    `${API}?page=${page}&size=${PAGE_SIZE}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "", status: ["OPEN"] })
    }
  );

  if (!response.ok) {
    throw new Error(`Errore inPA: HTTP ${response.status}`);
  }

  return response.json();
}

async function main() {
  console.log("Ricerca bandi aperti su inPA...");

  const first = await fetchPage(0);
  const totalPages = Math.ceil(
    (first.totalElements || 0) / PAGE_SIZE
  );

  let records = [...(first.content || [])];

  for (let page = 1; page < totalPages; page++) {
    const data = await fetchPage(page);
    records.push(...(data.content || []));
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();

  const jobs = records
    .filter(item => {
      const text = clean([
        item.titolo,
        item.figuraRicercata,
        item.descrizione
      ].join(" "));

      return /psicolog\w*/i.test(text);
    })
    .filter(item => {
      if (!item.id || seen.has(String(item.id))) return false;
      seen.add(String(item.id));

      if (item.dataScadenza) {
        const deadline = String(item.dataScadenza).slice(0, 10);
        if (deadline < today) return false;
      }

      return true;
    })
    .map(item => {
      const org = clean(item.entiRiferimento?.[0]) || "Ente pubblico";
      const region = clean(item.sedi?.[0]) || "Italia";
      const title = clean(item.titolo) ||
        clean(item.figuraRicercata) || "Selezione per psicologi";

      return {
        id: String(item.id),
        title,
        org,
        region,
        city: region,
        sector: "Pubblico",
        contract: "Verificare nel bando ufficiale",
        date: item.dataScadenza
          ? String(item.dataScadenza).slice(0, 10)
          : "",
        initials: initials(org),
        summary: clean(item.descrizione).slice(0, 500) ||
          "Consulta il bando ufficiale per requisiti e modalità di candidatura.",
        source: item.linkReindirizzamento ||
          `https://www.inpa.gov.it/bandi-e-avvisi/dettaglio-bando-avviso/?concorso_id=${item.id}`
      };
    });

  fs.writeFileSync("jobs.json", JSON.stringify(jobs, null, 2));

  console.log(`Annunci selezionati: ${jobs.length}`);
  console.log("File jobs.json creato.");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
