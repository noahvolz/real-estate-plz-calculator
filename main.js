// main.js
// Step 1 UI: read inputs from the form, run a single scenario, show results.

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

// ---------- Render results ----------

function renderResults(result) {
  const kpiDiv = document.getElementById("resultsKpis");
  const rawPre = document.getElementById("resultsRaw");

  if (!result || !result.kpis) {
    kpiDiv.innerHTML = "<p>No result.</p>";
    rawPre.textContent = "";
    return;
  }

  const k = result.kpis;

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

  rawPre.textContent = JSON.stringify(result, null, 2);
}

// ---------- Wire up button ----------

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("runCalcBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const inputs = collectInputsFromForm();
    console.log("Running simulation with inputs:", inputs);
    const result = simulateScenario(inputs, null);
    console.log("Simulation result:", result.kpis);
    renderResults(result);
  });

  // Run once on load with default values
  const initialInputs = collectInputsFromForm();
  const initialResult = simulateScenario(initialInputs, null);
  renderResults(initialResult);
});
