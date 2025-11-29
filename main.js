// main.js
// Entry point for the app – currently just a wiring + model test.

import { socioData } from "./socioData.js";
import { simulateScenario } from "./model.js";

console.log("App loaded.");
console.log("socioData currently has", socioData.length, "entries.");

// --- Simple test scenario (hard-coded for now) -----------------

const testInputs = {
  startYear: 2025,
  buildingValue: 200000,
  landValue: 80000,

  grEStRate: 0.05,
  maklerRate: 0.03,
  grundbuchRate: 0.005,
  notaryRate: 0.015,
  companyCost: 0,

  fittingUp: 30000,
  initialRepairs: 5000,

  buildingLossRate: 0.01,
  landGrowthRate: 0.005,
  constructionCostGrowth: 0.015,

  annualMaintenance: 3000,
  maintenanceGrowth: 0.0125,

  sqm: 80,
  monthlyRent: 1200,
  vacancyRate: 0.05,
  rentGrowth: 0.01,

  incomeTaxRate: 0.3,

  equity: 80000,
  loanTermYears1: 30,
  fixRateYears1: 20,
  interestRate1: 0.035,
  discountRate: 0.0,

  loanTermYears2: 10,
  interestRate2: 0.04,

  sellingCostRate: 0.03,
  saleMode: "sell", // try "hold" as well
  saleYear: 15,

  investmentHorizonYears: 30,

  altReturnBeforeTax: 0.06,
  altTaxRate: 0.26,

  afaModel: "Linear 2%",
  buildingLifetimeYears: 50,
};

// For now we don't use socioContext in the model directly
const result = simulateScenario(testInputs, null);

console.log("Simulation result (KPIs):", result.kpis);
console.log("First 3 years:", result.years.slice(0, 3));
console.log("Last year:", result.years[result.years.length - 1]);
