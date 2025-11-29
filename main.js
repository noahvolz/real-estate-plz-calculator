// main.js
// UI: form -> 3 scenarios (base / optimistic / pessimistic) -> show active scenario
// + PLZ-based suggestions for rent, vacancy & rent growth.

import { socioData } from "./socioData.js";
import { simulateScenario } from "./model.js";

console.log("App loaded.");
console.log("socioData currently has", socioData.length, "entries.");

// ---------- Helpers ----------

function parseNumber(id, defaultValue = 0) {
  const el = document.getElementById(id);
  if (!el) return defaultValue;
  const raw = el.value.replace(",", ".");
  const num = Number(raw);
  return Number.isFinite(num) ? num : defaultValue;
}

function parsePercent(id, defaultValue = 0) {
  // user enters e.g. 5 (%), we return 0.05
  const val = parseNumber(id, defaultValue);
  return val / 100;
}

function getSaleMode() {
  const radios = document.querySelectorAll('input[name="saleMode"]');
  for (const r of radios) {
    if (r.checked) return r.value;
  }
  return "hold";
}

function formatCurrency(amount) {
  return amount.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

function formatPercent(value, decimals = 1) {
  return `${(value * 100).toFixed(decimals)} %`;
}

// ---------- Collect inputs from form ----------

function collectInputsFromForm() {
  const saleMode = getSaleMode();
  const saleYear =
    saleMode === "sell" ? parseNumber("saleYear", 15) : null;

  return {
    startYear: new Date().getFullYear(),

    buildingValue: parseNumber("buildingValue", 0),
    landValue: parseNumber("landValue", 0),

    grEStRate: parsePercent("grEStRatePct", 5),
    maklerRate: parsePercent("maklerRatePct", 3),
    grundbuchRate: parsePercent("grundbuchRatePct", 0.5),
    notaryRate: parsePercent("notaryRatePct", 1.5),
    companyCost: parseNumber("companyCost", 0),

    fittingUp: parseNumber("fittingUp", 0),
    initialRepairs: parseNumber("initialRepairs", 0),

    buildingLossRate: parsePercent("buildingLossRatePct", 1),
    landGrowthRate: parsePercent("landGrowthRatePct", 0.5),
    constructionCostGrowth: parsePercent("constructionCostGrowthPct", 1.5),

    annualMaintenance: parseNumber("annualMaintenance", 0),
    maintenanceGrowth: parsePercent("maintenanceGrowthPct", 1.25),

    sqm: parseNumber("sqm", 0),
    monthlyRent: parseNumber("monthlyRent", 0),
    vacancyRate: parsePercent("vacancyRatePct", 5),
    rentGrowth: parsePercent("rentGrowthPct", 1),

    incomeTaxRate: parsePercent("incomeTaxRatePct", 30),

    equity: parseNumber("equity", 0),
    loanTermYears1: parseNumber("loanTermYears1", 30),
    fixRateYears1: parseNumber("fixRateYears1", 20),
    interestRate1: parsePercent("interestRate1Pct", 3.5),
    discountRate: parsePercent("discountRatePct", 0),

    loanTermYears2: parseNumber("loanTermYears2", 10),
    interestRate2: parsePercent("interestRate2Pct", 4),

    sellingCostRate: parsePercent("sellingCostRatePct", 3),
    saleMode,
    saleYear,

    investmentHorizonYears: parseNumber("investmentHorizonYears", 30),

    altReturnBeforeTax: parsePercent("altReturnBeforeTaxPct", 6),
    altTaxRate: parsePercent("altTaxRatePct", 26),

    afaModel: document.getElementById("afaModel").value,
    buildingLifetimeYears: parseNumber("buildingLifetimeYears", 50),
  };
}

// ---------- Scenario building ----------

// Take base inputs and derive optimistic / pessimistic variants
function buildScenarioInputs(baseInputs, variant) {
  const copy = { ...baseInputs };

  const rent = baseInputs.monthlyRent;
  const rentGrowth = baseInputs.rentGrowth;
  const vac = baseInputs.vacancyRate;

  if (variant === "opt") {
    // Optimistic: slightly higher rent, higher growth, lower vacancy
    copy.monthlyRent = rent * 1.05; // +5 %
    copy.rentGrowth = rentGrowth + 0.005; // +0.5 pp
    copy.vacancyRate = Math.max(0, vac - 0.02); // -2 pp
  } else if (variant === "pes") {
    // Pessimistic: slightly lower rent, lower growth, higher vacancy
    copy.monthlyRent = rent * 0.95; // -5 %
    copy.rentGrowth = Math.max(0, rentGrowth - 0.005); // -0.5 pp, min 0
    copy.vacancyRate = vac + 0.02; // +2 pp
  }
  // base: unchanged
  return copy;
}

// ---------- Socio / PLZ helpers ----------

function getSelectedPlzRecord() {
  const select = document.getElementById("plzSelect");
  if (!select) return null;
  const value = select.value;
  if (!value) return null;
  return socioData.find((r) => r.plz === value) || null;
}

function buildSocioSuggestions() {
  const rec = getSelectedPlzRecord();
  if (!rec) return null;

  const sqm = parseNumber("sqm", 0);
  const buildingValue = parseNumber("buildingValue", 0);
  const landValue = parseNumber("landValue", 0);
  const totalPrice = buildingValue + landValue;

  const {
    population,
    population_growth_pct,
    median_net_income_eur,
    unemployment_rate_pct,
    avg_rent_eur_m2,
    new_construction_units_per_1000_residents,
    vacancy_rate_pct,
    avg_purchase_price_eur_m2,
  } = rec;

  const suggestedMonthlyRent =
    sqm > 0 ? avg_rent_eur_m2 * sqm : null;

  // Base rent growth 1 % p.a., adjust with simple heuristics
  let rentGrowth = 0.01;

  if (population_growth_pct > 1.5) rentGrowth += 0.005;
  else if (population_growth_pct < 0) rentGrowth -= 0.003;

  if (vacancy_rate_pct < 2) rentGrowth += 0.003;
  if (new_construction_units_per_1000_residents > 5) rentGrowth -= 0.003;

  if (rentGrowth < 0) rentGrowth = 0;

  const suggestedVacancyRate = vacancy_rate_pct / 100;

  const benchmarkPricePerM2 = avg_purchase_price_eur_m2;
  const benchmarkTotalPrice =
    sqm > 0 ? benchmarkPricePerM2 * sqm : null;

  let priceComment = "";
  let priceBadge = "neutral";

  if (benchmarkTotalPrice && totalPrice > 0) {
    const diff = totalPrice - benchmarkTotalPrice;
    const diffPct = diff / benchmarkTotalPrice;

    if (diffPct < -0.1) {
      priceComment = "Below benchmark price level.";
      priceBadge = "good";
    } else if (Math.abs(diffPct) <= 0.1) {
      priceComment = "Around benchmark price level.";
      priceBadge = "neutral";
    } else {
      priceComment = "Above benchmark price level.";
      priceBadge = "bad";
    }
  }

  return {
    rec,
    sqm,
    totalPrice,
    suggestedMonthlyRent,
    suggestedVacancyRate,
    rentGrowth,
    benchmarkPricePerM2,
    benchmarkTotalPrice,
    priceComment,
    priceBadge,
  };
}

function updatePlzSummary() {
  const container = document.getElementById("plzSummary");
  if (!container) return;

  const s = buildSocioSuggestions();
  if (!s) {
    container.innerHTML = "<em>No PLZ selected yet.</em>";
    return;
  }

  const r = s.rec;

  const badgeClass =
    s.priceBadge === "good"
      ? "badge badge-good"
      : s.priceBadge === "bad"
      ? "badge badge-bad"
      : "badge badge-neutral";

  container.innerHTML = `
    <p><span class="highlight">PLZ ${r.plz}</span> – year ${r.year}</p>
    <p>Population: ${r.population.toLocaleString("de-DE")} (growth: ${r.population_growth_pct.toFixed(
      2
    )} % p.a.)</p>
    <p>Median net income: ${formatCurrency(
      r.median_net_income_eur
    )} &nbsp; Unemployment: ${r.unemployment_rate_pct.toFixed(1)} %</p>
    <p>Avg. rent: ${r.avg_rent_eur_m2.toFixed(
      2
    )} €/m² &nbsp; New construction: ${r.new_construction_units_per_1000_residents.toFixed(
    1
  )} / 1,000 residents</p>
    <p>Vacancy rate: ${r.vacancy_rate_pct.toFixed(1)} %</p>
    ${
      s.benchmarkTotalPrice
        ? `<p>Benchmark purchase price: <span class="highlight">${formatCurrency(
            s.benchmarkPricePerM2
          )}/m² → ${formatCurrency(
            s.benchmarkTotalPrice
          )} total</span></p>
           ${
             s.totalPrice
               ? `<p>Your current price: ${formatCurrency(
                   s.totalPrice
                 )} <span class="${badgeClass}">${s.priceComment}</span></p>`
               : ""
           }`
        : ""
    }
    ${
      s.suggestedMonthlyRent
        ? `<p>Suggested monthly rent (cold): <span class="highlight">${formatCurrency(
            s.suggestedMonthlyRent
          )}</span></p>`
        : ""
    }
    <p style="margin-top:4px;color:#6b7280;font-size:0.8rem;">
      Use the button above to apply suggested rent, vacancy & rent growth to your inputs.
    </p>
  `;
}

function applySocioToInputs() {
  const s = buildSocioSuggestions();
  if (!s) return;

  if (s.suggestedMonthlyRent != null) {
    const rentField = document.getElementById("monthlyRent");
    rentField.value = Math.round(s.suggestedMonthlyRent);
  }

  if (s.suggestedVacancyRate != null) {
    const vacField = document.getElementById("vacancyRatePct");
    vacField.value = (s.suggestedVacancyRate * 100).toFixed(1);
  }

  if (s.rentGrowth != null) {
    const growthField = document.getElementById("rentGrowthPct");
    growthField.value = (s.rentGrowth * 100).toFixed(2);
  }

  updatePlzSummary();
}

// ---------- Scenario state & rendering ----------

let scenarioResults = {
  base: null,
  opt: null,
  pes: null,
};
let activeScenario = "base";

function renderScenario(key) {
  const labelEl = document.getElementById("activeScenarioLabel");
  const kpiDiv = document.getElementById("resultsKpis");
  const rawPre = document.getElementById("resultsRaw");

  const data = scenarioResults[key];
  if (!data || !data.result || !data.result.kpis) {
    if (labelEl) labelEl.textContent = "–";
    kpiDiv.innerHTML = "<p>No result.</p>";
    rawPre.textContent = "";
    return;
  }

  activeScenario = key;
  if (labelEl) {
    labelEl.textContent =
      key === "base" ? "Base" : key === "opt" ? "Optimistic" : "Pessimistic";
  }

  // Highlight active tab
  const tabs = document.querySelectorAll(".scenario-tab");
  tabs.forEach((tab) => {
    tab.classList.toggle(
      "active",
      tab.dataset.scenario === activeScenario
    );
  });

  const k = data.result.kpis;

  kpiDiv.innerHTML = `
    <div class="kpi-row">
      <span class="kpi-label">Total ROE:</span>
      <span class="kpi-value">${formatPercent(k.roeTotal, 1)}</span>
    </div>
    <div class="kpi-row">
      <span class="kpi-label">Annualized ROE:</span>
      <span class="kpi-value">${formatPercent(k.roeAnnualized, 2)}</span>
    </div>
    <div class="kpi-row">
      <span class="kpi-label">Total profit (end of horizon):</span>
      <span class="kpi-value">${formatCurrency(k.totalProfit)}</span>
    </div>
    <div class="kpi-row">
      <span class="kpi-label">Equity multiple:</span>
      <span class="kpi-value">${k.equityMultiple.toFixed(2)}x</span>
    </div>
    <div class="kpi-row">
      <span class="kpi-label">Property value at end:</span>
      <span class="kpi-value">${formatCurrency(k.propertyValueEnd)}</span>
    </div>
    <div class="kpi-row">
      <span class="kpi-label">Remaining debt at end:</span>
      <span class="kpi-value">${formatCurrency(k.remainingDebtEnd)}</span>
    </div>
    <div class="kpi-row">
      <span class="kpi-label">Alternative investment end value:</span>
      <span class="kpi-value">${formatCurrency(k.altEndValue)}</span>
    </div>
  `;

  rawPre.textContent = JSON.stringify(
    { scenario: key, inputs: data.inputs, result: data.result },
    null,
    2
  );
}

function recalcAllScenarios() {
  const baseInputs = collectInputsFromForm();
  const baseResult = simulateScenario(baseInputs, null);

  const optInputs = buildScenarioInputs(baseInputs, "opt");
  const optResult = simulateScenario(optInputs, null);

  const pesInputs = buildScenarioInputs(baseInputs, "pes");
  const pesResult = simulateScenario(pesInputs, null);

  scenarioResults = {
    base: { inputs: baseInputs, result: baseResult },
    opt: { inputs: optInputs, result: optResult },
    pes: { inputs: pesInputs, result: pesResult },
  };

  // Make sure activeScenario is valid
  if (!scenarioResults[activeScenario]) {
    activeScenario = "base";
  }
  renderScenario(activeScenario);
}

// ---------- Init PLZ select ----------

function initPlzSelect() {
  const select = document.getElementById("plzSelect");
  if (!select) return;

  const sorted = [...socioData].sort((a, b) =>
    a.plz.localeCompare(b.plz)
  );

  for (const rec of sorted) {
    const opt = document.createElement("option");
    opt.value = rec.plz;
    opt.textContent = `${rec.plz} – population ${rec.population.toLocaleString(
      "de-DE"
    )}`;
    select.appendChild(opt);
  }

  select.addEventListener("change", () => {
    updatePlzSummary();
  });
}

// ---------- Wire up buttons & tabs ----------

document.addEventListener("DOMContentLoaded", () => {
  initPlzSelect();
  updatePlzSummary();

  const btn = document.getElementById("runCalcBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      recalcAllScenarios();
    });
  }

  const applySocioBtn = document.getElementById("applySocioBtn");
  if (applySocioBtn) {
    applySocioBtn.addEventListener("click", () => {
      applySocioToInputs();
      recalcAllScenarios();
    });
  }

  const tabs = document.querySelectorAll(".scenario-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const scenarioKey = tab.dataset.scenario;
      if (!scenarioKey) return;
      activeScenario = scenarioKey;
      renderScenario(activeScenario);
    });
  });

  // Run once on load with default values
  recalcAllScenarios();
});
