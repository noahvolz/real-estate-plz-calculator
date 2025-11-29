// model.js
// Core calculation engine for the real estate investment tool.
// All money values are in EUR, all rates are DECIMALS (e.g. 0.04 for 4%).

// -------------------------------------------------------------
// 1. Helper: Excel-like PMT (annuity payment) for yearly payments
// -------------------------------------------------------------
function pmt(rate, nper, pv) {
  // rate: interest rate per period (decimal)
  // nper: number of periods (years)
  // pv:   present value (loan amount, positive)
  if (Math.abs(rate) < 1e-9) {
    return nper > 0 ? pv / nper : 0;
  }
  return (pv * rate) / (1 - Math.pow(1 + rate, -nper));
}

// -------------------------------------------------------------
// 2. Helper: AfA rate per year based on selected model
// -------------------------------------------------------------
function getAfaRate(afaModel, year, lifetimeYears = 50) {
  const y = year;

  switch (afaModel) {
    case "Linear 2%":
    case "Linear 2% p.a.":
      return y <= 50 ? 0.02 : 0.0;

    case "Linear 3%":
    case "Linear 3% p.a.":
      return y <= 33 ? 0.03 : 0.0;

    case "Degressive 5% + Linear 2%":
      return y <= 6 ? 0.05 : 0.02;

    case "Degressive 5% + Linear 3%":
      return y <= 6 ? 0.05 : 0.03;

    case "Linear 1/Restnutzungsdauer":
    case "Linear 1 / remaining life":
      return y <= lifetimeYears ? 1 / lifetimeYears : 0.0;

    default:
      // Fallback: assume 2%
      return 0.02;
  }
}

// -------------------------------------------------------------
// 3. Main simulation function
// -------------------------------------------------------------

/**
 * Simulate one scenario for a property.
 *
 * @param {Object} inputs - All numeric inputs (see destructuring below).
 *   IMPORTANT: All rates must be given as DECIMALS:
 *     4 % -> 0.04, 1.5 % -> 0.015
 *
 * @param {Object|null} socioContext - Optional PLZ-based context (we may
 *   use it later for hints; it doesn't change the math here directly).
 *
 * @returns {Object} { years: [...], kpis: {...}, meta: {...} }
 */
export function simulateScenario(inputs = {}, socioContext = null) {
  // --- 3.1 Unpack inputs with sane defaults ------------------
  const {
    startYear = new Date().getFullYear(),

    // Property values
    buildingValue = 0,
    landValue = 0,

    // Purchase side costs (rates as decimals)
    grEStRate = 0, // real estate transfer tax
    maklerRate = 0,
    grundbuchRate = 0,
    notaryRate = 0,
    companyCost = 0, // fixed EUR

    // Initial CAPEX / repairs
    fittingUp = 0, // value-enhancing
    initialRepairs = 0, // repairs in year 1

    // Value development
    buildingLossRate = 0, // value loss p.a.
    landGrowthRate = 0, // land value growth p.a.
    constructionCostGrowth = 0, // building cost inflation p.a.

    // Operating / maintenance
    annualMaintenance = 0, // year 1, recurring
    maintenanceGrowth = 0, // p.a.

    // Rent & vacancy
    sqm = 0, // just for reference
    monthlyRent = 0, // cold rent per month for object
    vacancyRate = 0, // share of year empty
    rentGrowth = 0, // p.a.

    // Taxes
    incomeTaxRate = 0, // applies to rental and (simplified) capital gains

    // Financing - loan 1
    equity = 0,
    loanTermYears1 = 0,
    fixRateYears1 = 0, // currently not used differently than term
    interestRate1 = 0, // decimal
    discountRate = 0, // Disagio as decimal (e.g. 0.05 for 5 %)

    // Financing - loan 2 (refinancing)
    loanTermYears2 = 0,
    interestRate2 = interestRate1, // if not set, use same as loan 1

    // Sale vs hold
    sellingCostRate = 0, // % of property value, as decimal
    saleMode = "hold", // "hold" | "sell"
    saleYear = null, // if saleMode === "sell", year (1..horizon)

    // Horizon
    investmentHorizonYears = 30,

    // Alternative investment
    altReturnBeforeTax = 0,
    altTaxRate = incomeTaxRate,

    // AfA
    afaModel = "Linear 2%", // see getAfaRate
    buildingLifetimeYears = 50,
  } = inputs;

  const horizonYears = Math.max(1, investmentHorizonYears || 1);

  // --- 3.2 Basic investment & AfA basis -----------------------
  const purchasePrice = buildingValue + landValue;

  const sideCostRate =
    (grEStRate || 0) + (maklerRate || 0) + (grundbuchRate || 0) + (notaryRate || 0);

  const sideCostsVariable = purchasePrice * sideCostRate;
  const sideCostsTotal = sideCostsVariable + (companyCost || 0);

  const totalInvestment =
    purchasePrice + (fittingUp || 0) + (initialRepairs || 0) + sideCostsTotal;

  const financingNeed = totalInvestment - equity;

  const payoutFactor = 1 - (discountRate || 0); // Auszahlungs-Kurs
  const loanAmount1 =
    Math.abs(payoutFactor) > 1e-9 ? financingNeed / payoutFactor : financingNeed;

  const disagio = loanAmount1 - financingNeed; // tax-relevant in year 1 only

  // AfA basis: building + fittingUp + building share of ENK
  const buildingShare = purchasePrice > 0 ? buildingValue / purchasePrice : 0;
  const afaBasis =
    buildingValue + (fittingUp || 0) + sideCostsVariable * buildingShare;

  // --- 3.3 Loan schedule for loan 1 + loan 2 ------------------

  const r1 = interestRate1 || 0;
  const r2 = interestRate2 || 0;
  const n1 = loanTermYears1 || 0;
  const n2 = loanTermYears2 || 0;

  const annuity1 = n1 > 0 ? pmt(r1, n1, loanAmount1) : 0;

  let remainingDebt = loanAmount1; // at start of year 1
  let cumPrincipal = 0; // sum of all principal repaid over time
  let annuity2 = 0;
  let secondLoanStarted = false;

  // --- 3.4 Property values at start (year 0) ------------------
  let landVal = landValue;
  let buildingVal = buildingValue + (fittingUp || 0);
  let propertyVal = landVal + buildingVal;

  // --- 3.5 Yearly simulation ----------------------------------
  let cumulativeCF = 0;
  const years = [];
  let saleHappened = false;

  // For CGT basis (simplified): purchase price + value-enhancing costs
  const purchaseCostBasis =
    purchasePrice + (fittingUp || 0) + sideCostsVariable * buildingShare;

  for (let year = 1; year <= horizonYears; year++) {
    const calendarYear = startYear + year - 1;

    // ---- Loan phase detection ----
    let interestPaid = 0;
    let principalPaid = 0;
    let annualPayment = 0;

    const withinLoan1 = year <= n1 && remainingDebt > 1e-6;
    const withinLoan2 =
      !withinLoan1 &&
      n2 > 0 &&
      year <= n1 + n2 &&
      remainingDebt > 1e-6;

    if (withinLoan1) {
      // Loan 1 years
      annualPayment = annuity1;
      interestPaid = remainingDebt * r1;
      principalPaid = Math.min(annualPayment - interestPaid, remainingDebt);
      remainingDebt = Math.max(remainingDebt - principalPaid, 0);
      cumPrincipal += principalPaid;
    } else if (withinLoan2) {
      // First year of loan 2: compute annuity2 based on remainingDebt and n2
      if (!secondLoanStarted) {
        annuity2 = pmt(r2, n2, remainingDebt);
        secondLoanStarted = true;
      }
      annualPayment = annuity2;
      interestPaid = remainingDebt * r2;
      principalPaid = Math.min(annualPayment - interestPaid, remainingDebt);
      remainingDebt = Math.max(remainingDebt - principalPaid, 0);
      cumPrincipal += principalPaid;
    } else {
      // No loan or already fully repaid
      interestPaid = 0;
      principalPaid = 0;
      annualPayment = 0;
    }

    // ---- Rent & vacancy ----
    const grossRent =
      monthlyRent * 12 * Math.pow(1 + rentGrowth, Math.max(year - 1, 0));
    const netRent = grossRent * (1 - vacancyRate);

    // ---- Maintenance & repairs ----
    let maintenance;
    if (year === 1) {
      // year 1: recurring + initial repairs
      maintenance = -(annualMaintenance + initialRepairs);
    } else {
      // following years: recurring with growth
      maintenance =
        -annualMaintenance * Math.pow(1 + maintenanceGrowth, year - 1);
    }

    // ---- Depreciation (AfA) ----
    const afaRate = getAfaRate(afaModel, year, buildingLifetimeYears);
    const depreciation = -afaBasis * afaRate;

    // ---- Interest & principal as cash flows ----
    const interestExpense = -interestPaid; // negative: expense
    const principalFlow = -principalPaid; // negative: cash outflow

    // ---- Taxable result from rental (simplified) ----
    let taxable = netRent + maintenance + interestExpense + depreciation;

    // Disagio only in year 1 (expense)
    if (year === 1 && Math.abs(disagio) > 1e-6) {
      taxable += -disagio;
    }

    const taxCash = -incomeTaxRate * taxable; // >0 = tax saving, <0 = tax payment

    // ---- Cashflow before & after tax ----
    const cashBeforeTax = netRent + maintenance + interestExpense + principalFlow;
    let cashAfterTax = cashBeforeTax + taxCash;

    // ---- Update property values (still owning the property) ----
    landVal = landVal * (1 + landGrowthRate);
    buildingVal =
      buildingVal * (1 - buildingLossRate + constructionCostGrowth);
    propertyVal = landVal + buildingVal;

    // ---- Cumulative cashflow before any sale ----
    cumulativeCF += cashAfterTax;

    // ---- Wealth from CF & loan (Z_t) ----
    let wealthFromCFAndLoan = cumulativeCF + cumPrincipal;
    let equityPosition = propertyVal + wealthFromCFAndLoan - totalInvestment;

    // ---- Handle sale, if configured and not yet executed ----
    if (
      !saleHappened &&
      saleMode === "sell" &&
      saleYear != null &&
      year === saleYear
    ) {
      // Sale price minus selling costs
      const saleGross = propertyVal * (1 - sellingCostRate);

      // Capital gain (simplified)
      const capitalGain = saleGross - purchaseCostBasis;

      // Speculation rule: tax only if holding <= 10 years
      let cgt = 0;
      if (saleYear <= 10 && capitalGain > 0) {
        cgt = capitalGain * incomeTaxRate;
      }

      // Repay remaining debt from sale proceeds
      const repayDebt = remainingDebt;
      remainingDebt = 0;

      const saleNetCF = saleGross - repayDebt - cgt;

      // Add sale cash to this year's cashflow
      cashAfterTax += saleNetCF;
      cumulativeCF += saleNetCF;

      // After sale, we no longer own the property:
      propertyVal = 0;

      // Wealth now purely in cash & past loan repayments:
      wealthFromCFAndLoan = cumulativeCF + cumPrincipal;
      equityPosition = wealthFromCFAndLoan - totalInvestment;

      saleHappened = true;
    }

    years.push({
      yearIndex: year,
      calendarYear,
      remainingDebt,
      interestPaid,
      principalPaid,
      grossRent,
      netRent,
      maintenance,
      depreciation,
      taxable,
      taxCash,
      cashBeforeTax,
      cashAfterTax,
      cumulativeCF,
      propertyValue: propertyVal,
      wealthFromCFAndLoan,
      equityPosition,
    });
  }

  const last = years[years.length - 1];

  // --- 3.6 KPIs & alternative investment -----------------------

  const yearsUsed =
    saleMode === "sell" && saleYear != null
      ? Math.min(saleYear, horizonYears)
      : horizonYears;

  const equityInvested = equity;

  const equityPositionEnd = last.equityPosition;
  const totalProfit = equityPositionEnd;
  const roeTotal = equityInvested > 0 ? totalProfit / equityInvested : 0;
  const roeAnnualized =
    equityInvested > 0 && yearsUsed > 0
      ? Math.pow(1 + roeTotal, 1 / yearsUsed) - 1
      : 0;

  const equityMultiple =
    equityInvested > 0 ? (equityInvested + totalProfit) / equityInvested : 0;

  // Alternative investment: same horizon as yearsUsed
  const altAfterTaxReturn = altReturnBeforeTax * (1 - altTaxRate);
  const altEndValue =
    equityInvested * Math.pow(1 + altAfterTaxReturn, yearsUsed);
  const altProfit = altEndValue - equityInvested;

  return {
    meta: {
      startYear,
      horizonYears,
      saleMode,
      saleYear,
      totalInvestment,
      financingNeed,
      loanAmount1,
      disagio,
      afaBasis,
      purchaseCostBasis,
    },
    years,
    kpis: {
      equityInvested,
      equityPositionEnd,
      totalProfit,
      roeTotal,
      roeAnnualized,
      equityMultiple,
      propertyValueEnd: last.propertyValue,
      remainingDebtEnd: last.remainingDebt,
      cumulativeCFEnd: last.cumulativeCF,
      altEndValue,
      altProfit,
    },
  };
}
