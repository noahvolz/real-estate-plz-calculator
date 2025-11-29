// main.js
// Entry point for the app – currently just a wiring test.

import { socioData } from "./socioData.js";
import { simulateScenario } from "./model.js";

console.log("App loaded.");
console.log("socioData currently has", socioData.length, "entries.");

// Simple test call so we see something in the console
const testInputs = { dummy: true };
const testSocio = null;

const result = simulateScenario(testInputs, testSocio);
console.log("simulateScenario returned:", result);

// Later we'll:
// - read real inputs from the page
// - pick a PLZ from socioData
// - build scenarios and feed them into simulateScenario
