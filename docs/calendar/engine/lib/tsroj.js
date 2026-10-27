// SPDX-License-Identifier: GPL-3.0-only
// Vendored from @0xdolan/tsroj v1.0.6 (dist/index.mjs): https://github.com/0xdolan/tsroj
// Do not edit by hand: run `make vendor` to refresh.

// src/exceptions.ts
var TsrojError = class extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var TsrojRangeError = class extends TsrojError {
  constructor(message) {
    super(message);
  }
};
var TsrojValueError = class extends TsrojError {
  constructor(message) {
    super(message);
  }
};

// src/core/convert.ts
var GREGORIAN_EPOCH = 17214255e-1;
var PERSIAN_EPOCH = 19483205e-1;
var ISLAMIC_EPOCH = 19484395e-1;
var MIN_SUPPORTED_YEAR = 1;
var MAX_SUPPORTED_YEAR = 9999;
var KURDISH_SOLAR_YEAR_OFFSET = 1321;
function _mod(a, b) {
  return a - b * Math.floor(a / b);
}
function _requireInt(name, value) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TsrojValueError(`${name} must be an integer`);
  }
  return value;
}
function _requireFiniteNumber(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TsrojValueError(`${name} must be a finite number`);
  }
  return value;
}
function _requireYearBounds(name, year) {
  if (year < MIN_SUPPORTED_YEAR || year > MAX_SUPPORTED_YEAR) {
    throw new TsrojRangeError(
      `${name} must be in [${MIN_SUPPORTED_YEAR}, ${MAX_SUPPORTED_YEAR}], got ${year}`
    );
  }
  return year;
}
function isGregorianLeap(year) {
  year = _requireInt("year", year);
  _requireYearBounds("year", year);
  return year % 4 === 0 && !(year % 100 === 0 && year % 400 !== 0);
}
function gregorianToJdn(year, month, day) {
  year = _requireInt("year", year);
  month = _requireInt("month", month);
  day = _requireInt("day", day);
  _requireYearBounds("year", year);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
    throw new TsrojRangeError(
      `Invalid Gregorian date: ${year}-${month}-${day}`
    );
  }
  const adj = month <= 2 ? 0 : isGregorianLeap(year) ? -1 : -2;
  return GREGORIAN_EPOCH - 1 + 365 * (year - 1) + Math.floor((year - 1) / 4) + -Math.floor((year - 1) / 100) + Math.floor((year - 1) / 400) + Math.floor((367 * month - 362) / 12 + adj + day);
}
function jdnToGregorian(jdn) {
  jdn = _requireFiniteNumber("jdn", jdn);
  const wjd = Math.floor(jdn - 0.5) + 0.5;
  const depoch = wjd - GREGORIAN_EPOCH;
  const quadricent = Math.floor(depoch / 146097);
  const dqc = _mod(depoch, 146097);
  const cent = Math.floor(dqc / 36524);
  const dcent = _mod(dqc, 36524);
  const quad = Math.floor(dcent / 1461);
  const dquad = _mod(dcent, 1461);
  const yindex = Math.floor(dquad / 365);
  let year = Math.floor(quadricent * 400 + cent * 100 + quad * 4 + yindex);
  if (!(cent === 4 || yindex === 4)) {
    year += 1;
  }
  const dayOfYear = wjd - gregorianToJdn(year, 1, 1);
  let leapadj = 0;
  if (wjd >= gregorianToJdn(year, 3, 1)) {
    leapadj = isGregorianLeap(year) ? 1 : 2;
  }
  const month = Math.floor(((dayOfYear + leapadj) * 12 + 373) / 367);
  const day = Math.floor(wjd - gregorianToJdn(year, month, 1) + 1);
  return [year, month, day];
}
function gregorianDateToJdn(dt) {
  if (!(dt instanceof Date) || isNaN(dt.getTime())) {
    throw new TsrojValueError("dt must be a valid Date");
  }
  const base = gregorianToJdn(
    dt.getFullYear(),
    dt.getMonth() + 1,
    dt.getDate()
  );
  const seconds = dt.getHours() * 3600 + dt.getMinutes() * 60 + dt.getSeconds() + dt.getMilliseconds() / 1e3;
  return base + seconds / 86400;
}
function jdnToGregorianDate(jdn) {
  jdn = _requireFiniteNumber("jdn", jdn);
  const [y, m, d] = jdnToGregorian(jdn);
  const dayStart = Math.floor(jdn - 0.5) + 0.5;
  const frac = jdn - dayStart;
  let totalMilliseconds = Math.round(frac * 864e5);
  if (totalMilliseconds >= 864e5) {
    totalMilliseconds = 0;
    const base = new Date(y, m - 1, d);
    base.setDate(base.getDate() + 1);
    return base;
  }
  const seconds = Math.floor(totalMilliseconds / 1e3);
  const milliseconds = totalMilliseconds % 1e3;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const secs = seconds % 60;
  return new Date(y, m - 1, d, hours, minutes, secs, milliseconds);
}
function isPersianLeapYear(year) {
  year = _requireInt("year", year);
  _requireYearBounds("year", year);
  return ((year - (year >= 0 ? 474 : 473)) % 2820 + 474 + 38) * 682 % 2816 < 682;
}
function persianDaysInMonth(year, month) {
  year = _requireInt("year", year);
  month = _requireInt("month", month);
  _requireYearBounds("year", year);
  if (month < 1 || month > 12) {
    throw new TsrojRangeError("month must be 1..12");
  }
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isPersianLeapYear(year) ? 30 : 29;
}
function persianToJdn(year, month, day) {
  year = _requireInt("year", year);
  month = _requireInt("month", month);
  day = _requireInt("day", day);
  _requireYearBounds("year", year);
  const dim = persianDaysInMonth(year, month);
  if (day < 1 || day > dim) {
    throw new TsrojRangeError(
      `day must be 1..${dim} for Persian month ${month}`
    );
  }
  const epbase = year - (year >= 0 ? 474 : 473);
  const epyear = 474 + _mod(epbase, 2820);
  return day + (month <= 7 ? (month - 1) * 31 : (month - 1) * 30 + 6) + Math.floor((epyear * 682 - 110) / 2816) + (epyear - 1) * 365 + Math.floor(epbase / 2820) * 1029983 + (PERSIAN_EPOCH - 1);
}
function jdnToPersian(jdn) {
  jdn = _requireFiniteNumber("jdn", jdn);
  jdn = Math.floor(jdn) + 0.5;
  const depoch = jdn - persianToJdn(475, 1, 1);
  const cycle = Math.floor(depoch / 1029983);
  const cyear = _mod(depoch, 1029983);
  let ycycle;
  if (cyear === 1029982) {
    ycycle = 2820;
  } else {
    const aux1 = Math.floor(cyear / 366);
    const aux2 = _mod(cyear, 366);
    ycycle = Math.floor((2134 * aux1 + 2816 * aux2 + 2815) / 1028522) + aux1 + 1;
  }
  let year = Math.floor(ycycle + 2820 * cycle + 474);
  if (year <= 0) {
    year -= 1;
  }
  const dayOfYear = jdn - persianToJdn(year, 1, 1) + 1;
  let month;
  if (dayOfYear <= 186) {
    month = Math.ceil(dayOfYear / 31);
  } else {
    month = Math.ceil((dayOfYear - 6) / 30);
  }
  const day = Math.floor(jdn - persianToJdn(year, month, 1) + 1);
  return [year, month, day];
}
function isIslamicLeapYear(year) {
  year = _requireInt("year", year);
  _requireYearBounds("year", year);
  return (year * 11 + 14) % 30 < 11;
}
function islamicDaysInMonth(year, month) {
  year = _requireInt("year", year);
  month = _requireInt("month", month);
  _requireYearBounds("year", year);
  if (month < 1 || month > 12) {
    throw new TsrojRangeError("month must be 1..12");
  }
  if ([1, 3, 5, 7, 9, 11].includes(month)) return 30;
  if ([2, 4, 6, 8, 10].includes(month)) return 29;
  return isIslamicLeapYear(year) ? 30 : 29;
}
function islamicToJdn(year, month, day) {
  year = _requireInt("year", year);
  month = _requireInt("month", month);
  day = _requireInt("day", day);
  _requireYearBounds("year", year);
  const dim = islamicDaysInMonth(year, month);
  if (day < 1 || day > dim) {
    throw new TsrojRangeError(
      `day must be 1..${dim} for Islamic month ${month}`
    );
  }
  return day + Math.ceil(29.5 * (month - 1)) + (year - 1) * 354 + Math.floor((3 + 11 * year) / 30) + ISLAMIC_EPOCH - 1;
}
function jdnToIslamic(jdn) {
  jdn = _requireFiniteNumber("jdn", jdn);
  jdn = Math.floor(jdn) + 0.5;
  const year = Math.floor((30 * (jdn - ISLAMIC_EPOCH) + 10646) / 10631);
  const month = Math.min(
    12,
    Math.ceil((jdn - (29 + islamicToJdn(year, 1, 1))) / 29.5) + 1
  );
  const day = Math.floor(jdn - islamicToJdn(year, month, 1) + 1);
  return [year, month, day];
}
function persianWeekdayFromGregorian(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) {
    throw new TsrojValueError("d must be a valid Date");
  }
  const map = [2, 3, 4, 5, 6, 7, 1];
  return map[d.getUTCDay()];
}

// src/locales/ar/common.json
var common_default = {
  meta: {
    locale: "ar",
    script: "Arab",
    name: "Arabic"
  },
  digits: ["\u0660", "\u0661", "\u0662", "\u0663", "\u0664", "\u0665", "\u0666", "\u0667", "\u0668", "\u0669"],
  am_pm: ["\u0635", "\u0645"],
  calendar: {
    gregorian: {
      months: [
        ["\u064A\u0646\u0627\u064A\u0631"],
        ["\u0641\u0628\u0631\u0627\u064A\u0631"],
        ["\u0645\u0627\u0631\u0633"],
        ["\u0623\u0628\u0631\u064A\u0644"],
        ["\u0645\u0627\u064A\u0648"],
        ["\u064A\u0648\u0646\u064A\u0648"],
        ["\u064A\u0648\u0644\u064A\u0648"],
        ["\u0623\u063A\u0633\u0637\u0633"],
        ["\u0633\u0628\u062A\u0645\u0628\u0631"],
        ["\u0623\u0643\u062A\u0648\u0628\u0631"],
        ["\u0646\u0648\u0641\u0645\u0628\u0631"],
        ["\u062F\u064A\u0633\u0645\u0628\u0631"]
      ],
      months_short: [
        ["\u064A\u0646\u0627\u064A\u0631"],
        ["\u0641\u0628\u0631\u0627\u064A\u0631"],
        ["\u0645\u0627\u0631\u0633"],
        ["\u0623\u0628\u0631\u064A\u0644"],
        ["\u0645\u0627\u064A\u0648"],
        ["\u064A\u0648\u0646\u064A\u0648"],
        ["\u064A\u0648\u0644\u064A\u0648"],
        ["\u0623\u063A\u0633\u0637\u0633"],
        ["\u0633\u0628\u062A\u0645\u0628\u0631"],
        ["\u0623\u0643\u062A\u0648\u0628\u0631"],
        ["\u0646\u0648\u0641\u0645\u0628\u0631"],
        ["\u062F\u064A\u0633\u0645\u0628\u0631"]
      ],
      weekdays: [
        "\u0627\u0644\u0625\u062B\u0646\u064A\u0646",
        "\u0627\u0644\u062B\u0644\u0627\u062B\u0627\u0621",
        "\u0627\u0644\u0623\u0631\u0628\u0639\u0627\u0621",
        "\u0627\u0644\u062E\u0645\u064A\u0633",
        "\u0627\u0644\u062C\u0645\u0639\u0629",
        "\u0627\u0644\u0633\u0628\u062A",
        "\u0627\u0644\u0623\u062D\u062F"
      ],
      weekdays_short: [
        "\u0625\u062B\u0646\u064A\u0646",
        "\u062B\u0644\u0627\u062B\u0627\u0621",
        "\u0623\u0631\u0628\u0639\u0627\u0621",
        "\u062E\u0645\u064A\u0633",
        "\u062C\u0645\u0639\u0629",
        "\u0633\u0628\u062A",
        "\u0623\u062D\u062F"
      ],
      weekdays_min: ["\u0646", "\u062B", "\u0631", "\u062E", "\u062C", "\u0633", "\u062D"]
    },
    persian: {
      months: [
        ["\u0641\u0631\u0648\u0631\u062F\u064A\u0646"],
        ["\u0623\u0631\u062F\u064A\u0628\u0647\u0634\u062A"],
        ["\u062E\u0631\u062F\u0627\u062F"],
        ["\u062A\u064A\u0631"],
        ["\u0645\u0631\u062F\u0627\u062F"],
        ["\u0634\u0647\u0631\u064A\u0648\u0631"],
        ["\u0645\u0647\u0631"],
        ["\u0622\u0628\u0627\u0646"],
        ["\u0622\u0630\u0631"],
        ["\u062F\u064A"],
        ["\u0628\u0647\u0645\u0646"],
        ["\u0627\u0633\u0641\u0646\u062F"]
      ],
      months_short: [
        ["\u0641\u0631"],
        ["\u0623\u0631\u062F"],
        ["\u062E\u0631"],
        ["\u062A\u064A\u0631"],
        ["\u0645\u0631"],
        ["\u0634\u0647"],
        ["\u0645\u0647"],
        ["\u0622\u0628"],
        ["\u0622\u0630"],
        ["\u062F\u064A"],
        ["\u0628\u0647"],
        ["\u0627\u0633"]
      ],
      weekdays: [
        "\u0627\u0644\u0633\u0628\u062A",
        "\u0627\u0644\u0623\u062D\u062F",
        "\u0627\u0644\u0625\u062B\u0646\u064A\u0646",
        "\u0627\u0644\u062B\u0644\u0627\u062B\u0627\u0621",
        "\u0627\u0644\u0623\u0631\u0628\u0639\u0627\u0621",
        "\u0627\u0644\u062E\u0645\u064A\u0633",
        "\u0627\u0644\u062C\u0645\u0639\u0629"
      ],
      weekdays_short: [
        "\u0633\u0628\u062A",
        "\u0623\u062D\u062F",
        "\u0625\u062B\u0646\u064A\u0646",
        "\u062B\u0644\u0627\u062B\u0627\u0621",
        "\u0623\u0631\u0628\u0639\u0627\u0621",
        "\u062E\u0645\u064A\u0633",
        "\u062C\u0645\u0639\u0629"
      ],
      weekdays_min: ["\u0633", "\u062D", "\u062B", "\u062B", "\u0631", "\u062E", "\u062C"]
    },
    islamic: {
      months: [
        ["\u0645\u062D\u0631\u0645"],
        ["\u0635\u0641\u0631"],
        ["\u0631\u0628\u064A\u0639 \u0627\u0644\u0623\u0648\u0644"],
        ["\u0631\u0628\u064A\u0639 \u0627\u0644\u0622\u062E\u0631"],
        ["\u062C\u0645\u0627\u062F\u0649 \u0627\u0644\u0623\u0648\u0644\u0649"],
        ["\u062C\u0645\u0627\u062F\u0649 \u0627\u0644\u0622\u062E\u0631"],
        ["\u0631\u062C\u0628"],
        ["\u0634\u0639\u0628\u0627\u0646"],
        ["\u0631\u0645\u0636\u0627\u0646"],
        ["\u0634\u0648\u0627\u0644"],
        ["\u0630\u0648 \u0627\u0644\u0642\u0639\u062F\u0629"],
        ["\u0630\u0648 \u0627\u0644\u062D\u062C\u0629"]
      ],
      months_short: [
        ["\u0645\u062D"],
        ["\u0635\u0641"],
        ["\u06311"],
        ["\u06312"],
        ["\u062C1"],
        ["\u062C2"],
        ["\u0631\u062C"],
        ["\u0634\u0639"],
        ["\u0631\u0645"],
        ["\u0634\u0648"],
        ["\u0642\u0639"],
        ["\u062D\u062C"]
      ],
      weekdays: [
        "\u0627\u0644\u0633\u0628\u062A",
        "\u0627\u0644\u0623\u062D\u062F",
        "\u0627\u0644\u0625\u062B\u0646\u064A\u0646",
        "\u0627\u0644\u062B\u0644\u0627\u062B\u0627\u0621",
        "\u0627\u0644\u0623\u0631\u0628\u0639\u0627\u0621",
        "\u0627\u0644\u062E\u0645\u064A\u0633",
        "\u0627\u0644\u062C\u0645\u0639\u0629"
      ],
      weekdays_short: [
        "\u0633\u0628\u062A",
        "\u0623\u062D\u062F",
        "\u0625\u062B\u0646\u064A\u0646",
        "\u062B\u0644\u0627\u062B\u0627\u0621",
        "\u0623\u0631\u0628\u0639\u0627\u0621",
        "\u062E\u0645\u064A\u0633",
        "\u062C\u0645\u0639\u0629"
      ],
      weekdays_min: ["\u0633", "\u062D", "\u062B", "\u062B", "\u0631", "\u062E", "\u062C"]
    }
  }
};

// src/locales/ckb/common.json
var common_default2 = {
  meta: {
    locale: "ckb",
    script: "Arab",
    name: "Central Kurdish (Sorani)"
  },
  digits: ["\u0660", "\u0661", "\u0662", "\u0663", "\u0664", "\u0665", "\u0666", "\u0667", "\u0668", "\u0669"],
  am_pm: ["\u067E.\u0646", "\u062F.\u0646"],
  calendar: {
    gregorian: {
      months: [
        ["\u06CC\u06D5\u0646\u0627\u06CC\u0631"],
        ["\u0641\u06D5\u0628\u0631\u0627\u06CC\u0631"],
        ["\u0645\u0627\u0631\u0633"],
        ["\u0626\u06D5\u067E\u0631\u06CC\u0644"],
        ["\u0645\u0627\u06CC\u06C6"],
        ["\u06CC\u0648\u0646\u06CC\u06C6"],
        ["\u06CC\u0648\u0644\u06CC\u06C6"],
        ["\u0626\u06C6\u06AF\u06C6\u0633\u062A"],
        ["\u0633\u06CE\u067E\u062A\u06D5\u0645\u0628\u06D5\u0631"],
        ["\u0626\u06C6\u06A9\u062A\u06C6\u0628\u06D5\u0631"],
        ["\u0646\u06C6\u06A4\u06D5\u0645\u0628\u06D5\u0631"],
        ["\u062F\u06CC\u0633\u06D5\u0645\u0628\u06D5\u0631"]
      ],
      months_short: [
        ["\u06CC\u06D5\u0646\u0627\u06CC\u0631"],
        ["\u0641\u06D5\u0628\u0631\u0627\u06CC\u0631"],
        ["\u0645\u0627\u0631\u0633"],
        ["\u0626\u06D5\u067E\u0631\u06CC\u0644"],
        ["\u0645\u0627\u06CC\u06C6"],
        ["\u06CC\u0648\u0646\u06CC\u06C6"],
        ["\u06CC\u0648\u0644\u06CC\u06C6"],
        ["\u0626\u06C6\u06AF\u06C6\u0633\u062A"],
        ["\u0633\u06CE\u067E\u062A\u06D5\u0645\u0628\u06D5\u0631"],
        ["\u0626\u06C6\u06A9\u062A\u06C6\u0628\u06D5\u0631"],
        ["\u0646\u06C6\u06A4\u06D5\u0645\u0628\u06D5\u0631"],
        ["\u062F\u06CC\u0633\u06D5\u0645\u0628\u06D5\u0631"]
      ],
      weekdays: [
        "\u062F\u0648\u0648\u0634\u06D5\u0645\u0645\u06D5",
        "\u0633\u06CE\u0634\u06D5\u0645\u0645\u06D5",
        "\u0686\u0648\u0627\u0631\u0634\u06D5\u0645\u0645\u06D5",
        "\u067E\u06CE\u0646\u062C\u0634\u06D5\u0645\u0645\u06D5",
        "\u0647\u06D5\u06CC\u0646\u06CC",
        "\u0634\u06D5\u0645\u0645\u06D5",
        "\u06CC\u06D5\u06A9\u0634\u06D5\u0645\u0645\u06D5"
      ],
      weekdays_short: ["\u062F\u0648\u0648", "\u0633\u06CE", "\u0686\u0648\u0627\u0631", "\u067E\u06CE\u0646\u062C", "\u0647\u06D5\u06CC\u0646\u06CC", "\u0634\u06D5\u0645\u0645\u06D5", "\u06CC\u06D5\u06A9"],
      weekdays_min: ["\u062F", "\u0633", "\u0686", "\u067E", "\u0647", "\u0634", "\u06CC"]
    },
    kurdish: {
      months: [
        {
          names: ["\u0646\u06D5\u0648\u0631\u06C6\u0632", "\u062E\u0627\u06A9\u0647\u200C\u0644\u06CE\u0648\u0647", "\u06BE\u06D5\u0631\u0645\u06CE \u067E\u0634\u06A9\u0648\u0627\u0646"],
          short: ["\u0646\u06D5\u0648\u0631", "\u062E\u0627\u06A9", "\u06BE\u06D5\u0631\u0645"]
        },
        {
          names: ["\u06AF\u0648\u06B5\u0627\u0646", "\u0628\u0627\u0646\u06D5\u0645\u06D5\u0695"],
          short: ["\u06AF\u0648\u06B5", "\u0628\u0627\u0646"]
        },
        {
          names: ["\u062C\u06C6\u0632\u0647\u200C\u0631\u062F\u0627\u0646"],
          short: ["\u062C\u06C6\u0632"]
        },
        {
          names: ["\u067E\u0648\u0648\u0634\u067E\u06D5\u0695"],
          short: ["\u067E\u0648\u0648\u0634"]
        },
        {
          names: ["\u06AF\u0647\u200C\u0644\u0627\u0648\u06CE\u0698"],
          short: ["\u06AF\u0647\u200C\u0644"]
        },
        {
          names: ["\u062E\u0647\u200C\u0631\u0645\u0627\u0646\u0627\u0646"],
          short: ["\u062E\u0647\u200C\u0631"]
        },
        {
          names: ["\u0695\u06D5\u0632\u0628\u06D5\u0631"],
          short: ["\u0695\u06D5\u0632"]
        },
        {
          names: ["\u06AF\u06D5\u06B5\u0627\u0695\u06CE\u0632\u0627\u0646"],
          short: ["\u06AF\u06D5\u06B5"]
        },
        {
          names: ["\u0633\u0647\u200C\u0631\u0645\u0627\u0648\u0647\u200C\u0632"],
          short: ["\u0633\u0647\u200C\u0631"]
        },
        {
          names: ["\u0628\u0647\u200C\u0641\u0631\u0627\u0646\u0628\u0627\u0631"],
          short: ["\u0628\u0647\u200C\u0641"]
        },
        {
          names: ["\u0695\u06CE\u0628\u06D5\u0646\u062F\u0627\u0646"],
          short: ["\u0695\u06CE\u0628"]
        },
        {
          names: ["\u0695\u06D5\u0634\u06D5\u0645\u06CE", "\u0695\u06D5\u0634\u06D5\u0645\u06D5"],
          short: ["\u0695\u06D5\u0634", "\u0695\u06D5\u0634"]
        }
      ],
      weekdays: [
        { names: ["\u0634\u06D5\u0645\u0645\u06D5"], short: ["\u0634\u06D5\u0645"], min: ["\u0634"] },
        {
          names: ["\u06CC\u06D5\u06A9\u0634\u06D5\u0645\u0645\u06D5", "\u06CC\u06D5\u06A9\u0634\u06D5\u0645"],
          short: ["\u06CC\u06D5\u06A9", "\u06CC"],
          min: ["\u06CC", "\u06CC"]
        },
        {
          names: ["\u062F\u0648\u0648\u0634\u06D5\u0645\u0645\u06D5", "\u062F\u0648\u0648\u0634\u06D5\u0645"],
          short: ["\u062F\u0648\u0648", "\u062F"],
          min: ["\u062F", "\u062F"]
        },
        {
          names: ["\u0633\u06CE\u0634\u06D5\u0645\u0645\u06D5", "\u0633\u06CE\u0634\u06D5\u0645"],
          short: ["\u0633\u06CE", "\u0633"],
          min: ["\u0633", "\u0633"]
        },
        {
          names: ["\u0686\u0648\u0627\u0631\u0634\u06D5\u0645\u0645\u06D5", "\u0686\u0648\u0627\u0631\u0634\u06D5\u0645"],
          short: ["\u0686\u0648\u0627\u0631", "\u0686"],
          min: ["\u0686", "\u0686"]
        },
        {
          names: ["\u067E\u06CE\u0646\u062C\u0634\u06D5\u0645\u0645\u06D5", "\u067E\u06CE\u0646\u062C\u0634\u06D5\u0645"],
          short: ["\u067E\u06CE\u0646\u062C", "\u067E"],
          min: ["\u067E", "\u067E"]
        },
        {
          names: ["\u0647\u06D5\u06CC\u0646\u06CC"],
          short: ["\u0647\u06D5\u06CC\u0646\u06CC"],
          min: ["\u0647"]
        }
      ]
    }
  }
};

// src/locales/en/common.json
var common_default3 = {
  meta: {
    locale: "en",
    script: "Latn",
    name: "English"
  },
  digits: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  am_pm: ["am", "pm"],
  calendar: {
    gregorian: {
      months: [
        ["January"],
        ["February"],
        ["March"],
        ["April"],
        ["May"],
        ["June"],
        ["July"],
        ["August"],
        ["September"],
        ["October"],
        ["November"],
        ["December"]
      ],
      months_short: [
        ["Jan"],
        ["Feb"],
        ["Mar"],
        ["Apr"],
        ["May"],
        ["Jun"],
        ["Jul"],
        ["Aug"],
        ["Sep"],
        ["Oct"],
        ["Nov"],
        ["Dec"]
      ],
      weekdays: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
      ],
      weekdays_short: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      weekdays_min: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
    },
    persian: {
      months: [
        ["Farvardin"],
        ["Ordibehesht"],
        ["Khordad"],
        ["Tir"],
        ["Mordad"],
        ["Shahrivar"],
        ["Mehr"],
        ["Aban"],
        ["Azar"],
        ["Dey"],
        ["Bahman"],
        ["Esfand"]
      ],
      months_short: [
        ["Far"],
        ["Ord"],
        ["Kho"],
        ["Tir"],
        ["Mor"],
        ["Sha"],
        ["Meh"],
        ["Aba"],
        ["Aza"],
        ["Dey"],
        ["Bah"],
        ["Esf"]
      ],
      weekdays: [
        "Saturday",
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
      ],
      weekdays_short: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
      weekdays_min: ["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"]
    },
    kurdish: {
      months: [
        ["Xakel\xEAwe"],
        ["Gulan"],
        ["Cozerdan"],
        ["P\xFB\u015Fper"],
        ["Gelaw\xEAj"],
        ["Xermanan"],
        ["Rezber"],
        ["Gelar\xEAzan"],
        ["Sermawez"],
        ["Befranbar"],
        ["R\xEAbendan"],
        ["Re\u015Feme"]
      ],
      months_short: [
        ["Xak"],
        ["Gul"],
        ["Cozerd"],
        ["P\xFB\u015Fper"],
        ["Gelaw\xEAj"],
        ["Xerman"],
        ["Rezber"],
        ["Gelar\xEAz"],
        ["Serma"],
        ["Befran"],
        ["R\xEAbend"],
        ["Re\u015Feme"]
      ],
      weekdays: [
        "Saturday",
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
      ],
      weekdays_short: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
      weekdays_min: ["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"]
    },
    islamic: {
      months: [
        ["Muharram"],
        ["Safar"],
        ["Rabi' al-awwal"],
        ["Rabi' al-Thani"],
        ["Jumada al-awwal"],
        ["Jumada al-Thani"],
        ["Rajab"],
        ["Sha'ban"],
        ["Ramadan"],
        ["Shawwal"],
        ["Dhu al-Qi'dah"],
        ["Dhu al-Hijjah"]
      ],
      months_short: [
        ["Muh"],
        ["Saf"],
        ["R-I"],
        ["R-II"],
        ["J-I"],
        ["J-II"],
        ["Raj"],
        ["Sha"],
        ["Ram"],
        ["Shaw"],
        ["ZQ"],
        ["ZH"]
      ],
      weekdays: [
        "Saturday",
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
      ],
      weekdays_short: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
      weekdays_min: ["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"]
    }
  }
};

// src/locales/fa/common.json
var common_default4 = {
  meta: {
    locale: "fa",
    script: "Arab",
    name: "Persian"
  },
  digits: ["\u06F0", "\u06F1", "\u06F2", "\u06F3", "\u06F4", "\u06F5", "\u06F6", "\u06F7", "\u06F8", "\u06F9"],
  am_pm: ["\u0642.\u0638", "\u0628.\u0638"],
  calendar: {
    gregorian: {
      months: [
        ["\u0698\u0627\u0646\u0648\u06CC\u0647"],
        ["\u0641\u0648\u0631\u06CC\u0647"],
        ["\u0645\u0627\u0631\u0633"],
        ["\u0622\u0648\u0631\u06CC\u0644"],
        ["\u0645\u0647"],
        ["\u0698\u0648\u0626\u0646"],
        ["\u0698\u0648\u0626\u06CC\u0647"],
        ["\u0627\u0648\u062A"],
        ["\u0633\u067E\u062A\u0627\u0645\u0628\u0631"],
        ["\u0627\u06A9\u062A\u0628\u0631"],
        ["\u0646\u0648\u0627\u0645\u0628\u0631"],
        ["\u062F\u0633\u0627\u0645\u0628\u0631"]
      ],
      months_short: [
        ["\u0698\u0627\u0646"],
        ["\u0641\u0648\u0631"],
        ["\u0645\u0627\u0631"],
        ["\u0622\u0648\u0631"],
        ["\u0645\u0647"],
        ["\u0698\u0648\u0626"],
        ["\u0698\u0648\u06CC"],
        ["\u0627\u0648\u062A"],
        ["\u0633\u067E\u062A"],
        ["\u0627\u06A9\u062A"],
        ["\u0646\u0648\u0627"],
        ["\u062F\u0633\u0627"]
      ],
      weekdays: [
        "\u062F\u0648\u0634\u0646\u0628\u0647",
        "\u0633\u0647\u200C\u0634\u0646\u0628\u0647",
        "\u0686\u0647\u0627\u0631\u0634\u0646\u0628\u0647",
        "\u067E\u0646\u062C\u200C\u0634\u0646\u0628\u0647",
        "\u0622\u062F\u06CC\u0646\u0647",
        "\u0634\u0646\u0628\u0647",
        "\u06CC\u06A9\u200C\u0634\u0646\u0628\u0647"
      ],
      weekdays_short: ["\u062F\u0648", "\u0633\u0647", "\u0686\u0647\u0627\u0631", "\u067E\u0646\u062C", "\u0622\u062F", "\u0634\u0646\u0628\u0647", "\u06CC\u06A9"],
      weekdays_min: ["\u062F", "\u0633", "\u0686", "\u067E", "\u0622", "\u0634", "\u06CC"]
    },
    persian: {
      months: [
        ["\u0641\u0631\u0648\u0631\u062F\u06CC\u0646"],
        ["\u0627\u0631\u062F\u06CC\u0628\u0647\u0634\u062A"],
        ["\u062E\u0631\u062F\u0627\u062F"],
        ["\u062A\u06CC\u0631"],
        ["\u0645\u0631\u062F\u0627\u062F"],
        ["\u0634\u0647\u0631\u06CC\u0648\u0631"],
        ["\u0645\u0647\u0631"],
        ["\u0622\u0628\u0627\u0646"],
        ["\u0622\u0630\u0631"],
        ["\u062F\u06CC"],
        ["\u0628\u0647\u0645\u0646"],
        ["\u0627\u0633\u0641\u0646\u062F"]
      ],
      months_short: [
        ["\u0641\u0631\u0648"],
        ["\u0627\u0631\u062F"],
        ["\u062E\u0631\u062F"],
        ["\u062A\u06CC\u0631"],
        ["\u0645\u0631\u062F"],
        ["\u0634\u0647\u0631"],
        ["\u0645\u0647\u0631"],
        ["\u0622\u0628\u0627"],
        ["\u0622\u0630\u0631"],
        ["\u062F\u06CC"],
        ["\u0628\u0647\u0645"],
        ["\u0627\u0633\u0641"]
      ],
      weekdays: [
        "\u0634\u0646\u0628\u0647",
        "\u06CC\u06A9\u0634\u0646\u0628\u0647",
        "\u062F\u0648\u0634\u0646\u0628\u0647",
        "\u0633\u0647\u200C\u0634\u0646\u0628\u0647",
        "\u0686\u0647\u0627\u0631\u0634\u0646\u0628\u0647",
        "\u067E\u0646\u062C\u200C\u0634\u0646\u0628\u0647",
        "\u0622\u062F\u06CC\u0646\u0647"
      ],
      weekdays_short: ["\u0634\u0646\u0628\u0647", "\u06CC\u06A9", "\u062F\u0648", "\u0633\u0647", "\u0686\u0647\u0627\u0631", "\u067E\u0646\u062C", "\u0622\u062F"],
      weekdays_min: ["\u0634", "\u06CC", "\u062F", "\u0633", "\u0686", "\u067E", "\u0622"]
    },
    islamic: {
      months: [
        ["\u0645\u062D\u0631\u0645"],
        ["\u0635\u0641\u0631"],
        ["\u0631\u0628\u06CC\u0639\u200C\u0627\u0644\u0627\u0648\u0644"],
        ["\u0631\u0628\u06CC\u0639\u200C\u0627\u0644\u062B\u0627\u0646\u06CC"],
        ["\u062C\u0645\u0627\u062F\u06CC\u200C\u0627\u0644\u0627\u0648\u0644"],
        ["\u062C\u0645\u0627\u062F\u06CC\u200C\u0627\u0644\u062B\u0627\u0646\u06CC"],
        ["\u0631\u062C\u0628"],
        ["\u0634\u0639\u0628\u0627\u0646"],
        ["\u0631\u0645\u0636\u0627\u0646"],
        ["\u0634\u0648\u0627\u0644"],
        ["\u0630\u06CC\u0642\u0639\u062F\u0647"],
        ["\u0630\u06CC\u062D\u062C\u0647"]
      ],
      months_short: [
        ["\u0645\u062D\u0631"],
        ["\u0635\u0641\u0631"],
        ["\u0631\u0628\u06CC\u0639\u06F1"],
        ["\u0631\u0628\u06CC\u0639\u06F2"],
        ["\u062C\u0645\u0627\u062F\u06CC\u06F1"],
        ["\u062C\u0645\u0627\u062F\u06CC\u06F2"],
        ["\u0631\u062C\u0628"],
        ["\u0634\u0639\u0628"],
        ["\u0631\u0645\u0636"],
        ["\u0634\u0648"],
        ["\u0630\u06CC\u0642\u0639"],
        ["\u0630\u06CC\u062D\u062C"]
      ],
      weekdays: [
        "\u0634\u0646\u0628\u0647",
        "\u06CC\u06A9\u0634\u0646\u0628\u0647",
        "\u062F\u0648\u0634\u0646\u0628\u0647",
        "\u0633\u0647\u200C\u0634\u0646\u0628\u0647",
        "\u0686\u0647\u0627\u0631\u0634\u0646\u0628\u0647",
        "\u067E\u0646\u062C\u200C\u0634\u0646\u0628\u0647",
        "\u0622\u062F\u06CC\u0646\u0647"
      ],
      weekdays_short: ["\u0634\u0646\u0628\u0647", "\u06CC\u06A9", "\u062F\u0648", "\u0633\u0647", "\u0686\u0647\u0627\u0631", "\u067E\u0646\u062C", "\u0622\u062F"],
      weekdays_min: ["\u0634", "\u06CC", "\u062F", "\u0633", "\u0686", "\u067E", "\u0622"]
    }
  }
};

// src/locales/kmr/common.json
var common_default5 = {
  meta: {
    locale: "kmr",
    script: "Latn",
    name: "Northern Kurdish (Kurmanji)"
  },
  digits: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  am_pm: ["ber\xEE niweroj", "pi\u015Ft\xEE niweroj"],
  calendar: {
    gregorian: {
      months: [
        ["January"],
        ["February"],
        ["March"],
        ["April"],
        ["May"],
        ["June"],
        ["July"],
        ["August"],
        ["September"],
        ["October"],
        ["November"],
        ["December"]
      ],
      months_short: [
        ["Jan"],
        ["Feb"],
        ["Mar"],
        ["Apr"],
        ["May"],
        ["Jun"],
        ["Jul"],
        ["Aug"],
        ["Sep"],
        ["Oct"],
        ["Nov"],
        ["Dec"]
      ],
      weekdays: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
      ],
      weekdays_short: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      weekdays_min: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
    },
    kurdish: {
      months: [
        {
          names: ["Newroz", "Xakel\xEAwe", "N\xEEsan", "Herme Pi\u015Fkewan"],
          short: ["Newr", "Xakel", "N\xEEsa", "Herme"]
        },
        {
          names: ["Gulan", "Banem\xEAr"],
          short: ["Gula", "Ban"]
        },
        {
          names: ["Hez\xEEran", "Cozerdan"],
          short: ["Hez\xEE", "Coz"]
        },
        {
          names: ["T\xEErmeh", "P\xFB\u015Fper"],
          short: ["T\xEErm", "P\xFB\u015F"]
        },
        {
          names: ["Gelaw\xEAj"],
          short: ["Gela"]
        },
        {
          names: ["\xCElon", "Xermanan"],
          short: ["\xCElon", "Xerm"]
        },
        {
          names: ["Rezber"],
          short: ["Rezb"]
        },
        {
          names: ["Gellar\xEAzan"],
          short: ["Gell"]
        },
        {
          names: ["Sermawez"],
          short: ["Serm"]
        },
        {
          names: ["Befranbar"],
          short: ["Befr"]
        },
        {
          names: ["R\xEAbendan"],
          short: ["R\xEAbe"]
        },
        {
          names: ["Re\u015Fem\xEA", "Re\u015Feme"],
          short: ["Re\u015Fe", "Re\u015F"]
        }
      ],
      weekdays: [
        {
          names: ["\u015Eem\xEE", "Saturday"],
          short: ["\u015Eem", "Sat"],
          min: ["\u015E", "Sa"]
        },
        {
          names: ["Yek\u015Fem", "Sunday"],
          short: ["Yek", "Sun"],
          min: ["Y", "Su"]
        },
        {
          names: ["Du\u015Fem", "Monday"],
          short: ["Du\u015F", "Mon"],
          min: ["D", "Mo"]
        },
        {
          names: ["S\xEA\u015Fem", "Tuesday"],
          short: ["S\xEA\u015F", "Tue"],
          min: ["S", "Tu"]
        },
        {
          names: ["\xC7ar\u015Fem", "Wednesday"],
          short: ["\xC7ar\u015F", "Wed"],
          min: ["\xC7", "We"]
        },
        {
          names: ["P\xEAnc\u015Fem", "Thursday"],
          short: ["P\xEAnc", "Thu"],
          min: ["P", "Th"]
        },
        {
          names: ["\xCEn", "Friday"],
          short: ["\xCEn", "Fri"],
          min: ["\xCE", "Fr"]
        }
      ]
    }
  }
};

// src/locales/normalize.ts
var FORBIDDEN_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
var MAX_LABEL_LEN = 64;
function assertSafeString(value, path) {
  if (typeof value !== "string") {
    throw new Error(`${path}: expected string`);
  }
  if (value.length > MAX_LABEL_LEN) {
    throw new Error(`${path}: exceeds max length ${MAX_LABEL_LEN}`);
  }
  return value;
}
function unwrapStringList(raw, path) {
  if (typeof raw === "string") {
    return [assertSafeString(raw, path)];
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${path}: expected non-empty string or string array`);
  }
  return raw.map((name, i) => assertSafeString(name, `${path}[${i}]`));
}
function alignVariantList(primary, secondary, _path) {
  if (!secondary) {
    return [...primary];
  }
  return primary.map((name, i) => {
    if (secondary[i] !== void 0) {
      return secondary[i];
    }
    if (secondary[0] !== void 0) {
      return secondary[0];
    }
    return name;
  });
}
function normalizeVariantEntry(raw, path) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: expected variant object`);
  }
  const obj = raw;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`${path}: forbidden key ${key}`);
    }
  }
  const names = unwrapStringList(obj.names ?? obj.name, `${path}.names`);
  const short = obj.short ? alignVariantList(
    names,
    unwrapStringList(obj.short, `${path}.short`),
    `${path}.short`
  ) : void 0;
  const min = obj.min ? alignVariantList(
    names,
    unwrapStringList(obj.min, `${path}.min`),
    `${path}.min`
  ) : void 0;
  return { names, short, min };
}
function isVariantObject(raw) {
  return !!raw && typeof raw === "object" && !Array.isArray(raw) && ("names" in raw || "name" in raw);
}
function normalizeVariantEntries(raw, path, count, legacyShorts) {
  if (!Array.isArray(raw) || raw.length !== count) {
    throw new Error(`${path}: expected ${count} entries`);
  }
  const shorts = Array.isArray(legacyShorts) ? legacyShorts : void 0;
  return raw.map((entry, i) => {
    const entryPath = `${path}[${i}]`;
    if (isVariantObject(entry)) {
      return normalizeVariantEntry(entry, entryPath);
    }
    const names = unwrapStringList(entry, entryPath);
    const shortRaw = shorts?.[i];
    const short = shortRaw ? alignVariantList(
      names,
      unwrapStringList(shortRaw, `${path}_short[${i}]`),
      `${path}_short[${i}]`
    ) : void 0;
    return { names, short };
  });
}
function normalizeCalendarBlock(raw, path = "calendar") {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: expected object`);
  }
  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`${path}: forbidden key ${key}`);
    }
  }
  const block = raw;
  const months = normalizeVariantEntries(
    block.months,
    `${path}.months`,
    12,
    block.months_short
  );
  const weekdays = normalizeVariantEntries(
    block.weekdays,
    `${path}.weekdays`,
    7,
    void 0
  );
  const legacyShorts = block.weekdays_short;
  const legacyMins = block.weekdays_min;
  if (legacyShorts || legacyMins) {
    for (let i = 0; i < weekdays.length; i++) {
      const wd = weekdays[i];
      if (legacyShorts) {
        wd.short = alignVariantList(
          wd.names,
          unwrapStringList(
            (Array.isArray(legacyShorts) ? legacyShorts : [])[i],
            `${path}.weekdays_short[${i}]`
          ),
          `${path}.weekdays_short[${i}]`
        );
      }
      if (legacyMins) {
        wd.min = alignVariantList(
          wd.names,
          unwrapStringList(
            (Array.isArray(legacyMins) ? legacyMins : [])[i],
            `${path}.weekdays_min[${i}]`
          ),
          `${path}.weekdays_min[${i}]`
        );
      }
    }
  }
  return { months, weekdays };
}
function resolveVariantIndex(names, variant) {
  if (variant === void 0) {
    return 0;
  }
  if (typeof variant === "number") {
    if (variant >= 0 && variant < names.length) {
      return variant;
    }
    return 0;
  }
  const target = variant.normalize("NFC");
  const idx = names.findIndex((n) => n.normalize("NFC") === target);
  return idx >= 0 ? idx : 0;
}
function resolveVariantLabel(entries, index, field, variant) {
  const entry = entries[index];
  if (!entry?.names?.length) {
    return String(index + 1);
  }
  let variantIdx = resolveVariantIndex(entry.names, variant);
  if (typeof variant === "string") {
    const target = variant.normalize("NFC");
    const localIdx = entry.names.findIndex(
      (n) => n.normalize("NFC") === target
    );
    if (localIdx >= 0) {
      variantIdx = localIdx;
    } else {
      for (const e of entries) {
        const globalIdx = e.names.findIndex(
          (n) => n.normalize("NFC") === target
        );
        if (globalIdx >= 0 && e === entry) {
          variantIdx = globalIdx;
          break;
        }
      }
    }
  }
  const names = entry.names;
  const shorts = entry.short ?? names;
  const mins = entry.min ?? entry.short ?? names;
  const pool = field === "names" ? names : field === "short" ? shorts : mins;
  return pool[variantIdx] ?? pool[0] ?? names[0];
}
function resolveMonthName(months, monthIndex, variant) {
  if (typeof variant === "string") {
    const target = variant.normalize("NFC");
    for (let i = 0; i < months.length; i++) {
      const match = months[i].names.find((n) => n.normalize("NFC") === target);
      if (match) {
        return resolveVariantLabel(months, i, "names", variant);
      }
    }
  }
  return resolveVariantLabel(months, monthIndex, "names", variant);
}
function deepFreeze(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return value;
}

// src/locales/registry.ts
var LocaleId = /* @__PURE__ */ ((LocaleId2) => {
  LocaleId2["CKB"] = "ckb";
  LocaleId2["KMR"] = "kmr";
  LocaleId2["KU"] = "ku";
  LocaleId2["EN"] = "en";
  LocaleId2["FA"] = "fa";
  LocaleId2["AR"] = "ar";
  LocaleId2["TR"] = "tr";
  return LocaleId2;
})(LocaleId || {});
var CalendarKind = /* @__PURE__ */ ((CalendarKind2) => {
  CalendarKind2["KURDISH"] = "kurdish";
  CalendarKind2["GREGORIAN"] = "gregorian";
  CalendarKind2["PERSIAN"] = "persian";
  CalendarKind2["ISLAMIC"] = "islamic";
  return CalendarKind2;
})(CalendarKind || {});
var CALENDAR_CANONICAL_OWNER = {
  ["persian" /* PERSIAN */]: "fa" /* FA */,
  ["islamic" /* ISLAMIC */]: "ar" /* AR */
};
var LOCALE_ALIASES = {
  en: "en" /* EN */,
  fa: "fa" /* FA */,
  ar: "ar" /* AR */,
  tr: "tr" /* TR */,
  kmr: "kmr" /* KMR */,
  ckb: "ckb" /* CKB */,
  ku: "ckb" /* CKB */,
  "ku-latn": "kmr" /* KMR */,
  zza: "kmr" /* KMR */,
  diq: "kmr" /* KMR */,
  kiu: "kmr" /* KMR */,
  sdh: "ckb" /* CKB */,
  lki: "ckb" /* CKB */,
  hac: "ckb" /* CKB */,
  bqi: "ckb" /* CKB */
};
var LOADED_LOCALE_IDS = /* @__PURE__ */ new Set([
  "en" /* EN */,
  "kmr" /* KMR */,
  "ckb" /* CKB */,
  "fa" /* FA */,
  "ar" /* AR */,
  "tr" /* TR */
]);
function resolveLocaleId(lang) {
  const norm = String(lang).toLowerCase().replace("_", "-");
  const resolved = LOCALE_ALIASES[norm];
  if (resolved) return resolved;
  return "ckb" /* CKB */;
}
function isLoadedLocale(localeId) {
  return LOADED_LOCALE_IDS.has(localeId);
}

// src/locales/tr/common.json
var common_default6 = {
  meta: {
    locale: "tr",
    script: "Latn",
    name: "Turkish"
  },
  digits: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  am_pm: ["\xF6\xF6", "\xF6s"],
  calendar: {
    gregorian: {
      months: [
        ["Ocak"],
        ["\u015Eubat"],
        ["Mart"],
        ["Nisan"],
        ["May\u0131s"],
        ["Haziran"],
        ["Temmuz"],
        ["A\u011Fustos"],
        ["Eyl\xFCl"],
        ["Ekim"],
        ["Kas\u0131m"],
        ["Aral\u0131k"]
      ],
      months_short: [
        ["Oca"],
        ["\u015Eub"],
        ["Mar"],
        ["Nis"],
        ["May"],
        ["Haz"],
        ["Tem"],
        ["A\u011Fu"],
        ["Eyl"],
        ["Eki"],
        ["Kas"],
        ["Ara"]
      ],
      weekdays: [
        "Pazartesi",
        "Sal\u0131",
        "\xC7ar\u015Famba",
        "Per\u015Fembe",
        "Cuma",
        "Cumartesi",
        "Pazar"
      ],
      weekdays_short: ["Pzt", "Sal", "\xC7ar", "Per", "Cum", "Cmt", "Paz"],
      weekdays_min: ["Pt", "Sa", "\xC7a", "Pe", "Cu", "Ct", "Pz"]
    },
    persian: {
      months: [
        ["Farvardin"],
        ["Ordibehesht"],
        ["Khordad"],
        ["Tir"],
        ["Mordad"],
        ["Shahrivar"],
        ["Mehr"],
        ["Aban"],
        ["Azar"],
        ["Dey"],
        ["Bahman"],
        ["Esfand"]
      ],
      months_short: [
        ["Far"],
        ["Ord"],
        ["Kho"],
        ["Tir"],
        ["Mor"],
        ["Sha"],
        ["Meh"],
        ["Aba"],
        ["Aza"],
        ["Dey"],
        ["Bah"],
        ["Esf"]
      ],
      weekdays: [
        "Saturday",
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
      ],
      weekdays_short: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
      weekdays_min: ["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"]
    },
    kurdish: {
      months: [
        ["Xakel\xEAwe"],
        ["Gulan"],
        ["Cozerdan"],
        ["P\xFB\u015Fper"],
        ["Gelaw\xEAj"],
        ["Xermanan"],
        ["Rezber"],
        ["Gelar\xEAzan"],
        ["Sermawez"],
        ["Befranbar"],
        ["R\xEAbendan"],
        ["Re\u015Feme"]
      ],
      months_short: [
        ["Xak"],
        ["Gul"],
        ["Cozerd"],
        ["P\xFB\u015Fper"],
        ["Gelaw\xEAj"],
        ["Xerman"],
        ["Rezber"],
        ["Gelar\xEAz"],
        ["Serma"],
        ["Befran"],
        ["R\xEAbend"],
        ["Re\u015Feme"]
      ],
      weekdays: [
        "Saturday",
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
      ],
      weekdays_short: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
      weekdays_min: ["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"]
    },
    islamic: {
      months: [
        ["Muharrem"],
        ["Safer"],
        ["Rebi\xFClevvel"],
        ["Rebi\xFClahir"],
        ["Cemaziyelevvel"],
        ["Cemaziyelahir"],
        ["Recep"],
        ["\u015Eaban"],
        ["Ramazan"],
        ["\u015Eevval"],
        ["Zilkade"],
        ["Zilhicce"]
      ],
      months_short: [
        ["Muh"],
        ["Saf"],
        ["R-I"],
        ["R-II"],
        ["C-I"],
        ["C-II"],
        ["Rec"],
        ["\u015Eab"],
        ["Ram"],
        ["\u015Eev"],
        ["ZK"],
        ["ZH"]
      ],
      weekdays: [
        "Saturday",
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
      ],
      weekdays_short: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
      weekdays_min: ["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"]
    }
  }
};

// src/locales/bundles.ts
function loadBundle(raw, localeId) {
  const data = raw;
  const calendar = {};
  for (const [kind, block] of Object.entries(data.calendar)) {
    calendar[kind] = normalizeCalendarBlock(
      block,
      `${localeId}.calendar.${kind}`
    );
  }
  if (data.digits.length !== 10) {
    throw new Error(`${localeId}: digits must contain exactly 10 entries`);
  }
  if (data.am_pm.length !== 2) {
    throw new Error(`${localeId}: am_pm must contain exactly 2 entries`);
  }
  return deepFreeze({
    ...data,
    am_pm: [data.am_pm[0], data.am_pm[1]],
    calendar
  });
}
var LOCALE_BUNDLES = deepFreeze({
  ["en" /* EN */]: loadBundle(common_default3, "en" /* EN */),
  ["kmr" /* KMR */]: loadBundle(common_default5, "kmr" /* KMR */),
  ["ckb" /* CKB */]: loadBundle(common_default2, "ckb" /* CKB */),
  ["fa" /* FA */]: loadBundle(common_default4, "fa" /* FA */),
  ["ar" /* AR */]: loadBundle(common_default, "ar" /* AR */),
  ["tr" /* TR */]: loadBundle(common_default6, "tr" /* TR */)
});
function getBundle(localeId) {
  if (!isLoadedLocale(localeId) && localeId !== "ku" /* KU */) {
    return void 0;
  }
  return LOCALE_BUNDLES[localeId === "ku" /* KU */ ? "ckb" /* CKB */ : localeId];
}
function solarWeekdayBlock(localeId) {
  const bundle = getBundle(localeId);
  return bundle?.calendar["kurdish" /* KURDISH */] ?? bundle?.calendar["gregorian" /* GREGORIAN */];
}
function mergeCanonicalMonths(canonical, weekdays) {
  if (!weekdays) return canonical;
  return {
    months: canonical.months,
    weekdays: weekdays.weekdays
  };
}

// src/locales/format-options.ts
var RTL_NUMERIC_LOCALES = /* @__PURE__ */ new Set([
  "ckb" /* CKB */,
  "fa" /* FA */,
  "ar" /* AR */
]);
function resolveLeadingZero(localeId, explicit) {
  if (explicit !== void 0) return explicit;
  return !RTL_NUMERIC_LOCALES.has(localeId);
}
function resolveEzafeAfterDay(localeId, explicit) {
  if (localeId !== "ckb" /* CKB */) return false;
  if (explicit !== void 0) return explicit;
  return true;
}
function resolveEzafeOnMonth(localeId, explicit) {
  if (localeId !== "ckb" /* CKB */) return false;
  if (explicit !== void 0) return explicit;
  return true;
}
function mergeFormatOverrides(options) {
  if (!options) return {};
  const { overrides, ...top } = options;
  return {
    ...overrides,
    ...top.month !== void 0 ? { month: top.month } : {},
    ...top.monthShort !== void 0 ? { monthShort: top.monthShort } : {},
    ...top.weekday !== void 0 ? { weekday: top.weekday } : {},
    ...top.weekdayShort !== void 0 ? { weekdayShort: top.weekdayShort } : {},
    ...top.weekdayMin !== void 0 ? { weekdayMin: top.weekdayMin } : {},
    ...top.digits !== void 0 ? { digits: top.digits } : {},
    ...top.amPm !== void 0 ? { amPm: top.amPm } : {}
  };
}

// src/locales/resolve-labels.ts
function resolveCalendarLabels(locData, monthIndex, weekdayIndex, options) {
  const overrides = mergeFormatOverrides(options);
  const monthVariant = options?.monthVariant ?? options?.kurdishVariant;
  const weekdayVariant = options?.weekdayVariant;
  return {
    month: overrides.month ?? resolveMonthName(locData.months, monthIndex, monthVariant),
    monthShort: overrides.monthShort ?? resolveVariantLabel(locData.months, monthIndex, "short", monthVariant),
    weekday: overrides.weekday ?? resolveVariantLabel(
      locData.weekdays,
      weekdayIndex,
      "names",
      weekdayVariant
    ),
    weekdayShort: overrides.weekdayShort ?? resolveVariantLabel(
      locData.weekdays,
      weekdayIndex,
      "short",
      weekdayVariant
    ),
    weekdayMin: overrides.weekdayMin ?? resolveVariantLabel(
      locData.weekdays,
      weekdayIndex,
      "min",
      weekdayVariant
    )
  };
}
function resolveDigits(localeDigits, overrides) {
  if (overrides.digits) {
    if (overrides.digits.length !== 10) {
      throw new Error("digits override must contain exactly 10 characters");
    }
    return overrides.digits;
  }
  return localeDigits;
}

// src/locales/index.ts
function getLocaleData(localeId, calendar) {
  const owner = CALENDAR_CANONICAL_OWNER[calendar];
  if (owner) {
    const canonical = getBundle(owner)?.calendar[calendar];
    if (canonical) {
      return mergeCanonicalMonths(canonical, solarWeekdayBlock(localeId));
    }
  }
  const local = getBundle(localeId)?.calendar[calendar];
  if (local) {
    return local;
  }
  if (calendar === "kurdish" /* KURDISH */) {
    const fallback = getBundle("kmr" /* KMR */)?.calendar["kurdish" /* KURDISH */] ?? getBundle("ckb" /* CKB */)?.calendar["kurdish" /* KURDISH */];
    if (fallback) return fallback;
  }
  return getBundle("en" /* EN */)?.calendar["gregorian" /* GREGORIAN */] ?? (() => {
    throw new Error("locale bundle en/gregorian is missing");
  })();
}
function getAmPm(localeId, overrides) {
  const merged = overrides?.overrides?.amPm ?? overrides?.amPm;
  if (merged) return merged;
  const bundle = getBundle(localeId) ?? getBundle("en" /* EN */);
  return bundle?.am_pm ?? ["am", "pm"];
}
function getDigits(localeId, overrides) {
  const merged = overrides?.overrides?.digits ?? overrides?.digits;
  if (merged) return merged;
  const bundle = getBundle(localeId) ?? getBundle("en" /* EN */);
  return bundle?.digits ?? ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
}

// src/formatting.ts
var FORMAT_TOKENS = [
  "%Y",
  "%B",
  "%b",
  "%m",
  "%y",
  "%d",
  "%A",
  "%a",
  "%E",
  "%w",
  "%-w",
  "%-m",
  "%-d"
];
var DAY_TOKENS = /* @__PURE__ */ new Set(["%d", "%-d"]);
var MONTH_NAME_TOKENS = /* @__PURE__ */ new Set(["%B", "%b"]);
var YEAR_TOKENS = /* @__PURE__ */ new Set(["%Y", "%y"]);
var MAX_PATTERN_LEN = 512;
var SUSPICIOUS_REGEX = /[{}]/;
var EZAFE = "\u06CC";
function toLocaleDigits(numericStr, digitsMap) {
  return numericStr.split("").map((ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      return digitsMap[code - 48];
    }
    return ch;
  }).join("");
}
function tokenizeList(pattern) {
  const parts = [];
  let i = 0;
  while (i < pattern.length) {
    let matched = false;
    for (const tok of FORMAT_TOKENS) {
      if (pattern.startsWith(tok, i)) {
        parts.push({ type: "t", val: tok });
        i += tok.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      parts.push({ type: "l", val: pattern[i] });
      i++;
    }
  }
  return parts;
}
function analyzePattern(parts) {
  let hasDay = false;
  let hasMonthName = false;
  let hasYear = false;
  for (const seg of parts) {
    if (seg.type !== "t") continue;
    if (DAY_TOKENS.has(seg.val)) hasDay = true;
    if (MONTH_NAME_TOKENS.has(seg.val)) hasMonthName = true;
    if (YEAR_TOKENS.has(seg.val)) hasYear = true;
  }
  return { hasDay, hasMonthName, hasYear };
}
function formatDay(d, tok, padNumeric, ezafeAfterDay) {
  let out = tok === "%-d" ? String(d) : padNumeric ? String(d).padStart(2, "0") : String(d);
  if (ezafeAfterDay) out += EZAFE;
  return out;
}
function formatMonthNum(m, tok, padNumeric) {
  if (tok === "%-m") return String(m);
  return padNumeric ? String(m).padStart(2, "0") : String(m);
}
function formatMonthName(label, ezafeOnMonth) {
  return ezafeOnMonth ? label + EZAFE : label;
}
function formatCalendarDate(kd, pattern, options) {
  if (typeof pattern !== "string") {
    throw new TsrojValueError("pattern must be string");
  }
  if (pattern.length > MAX_PATTERN_LEN) {
    throw new TsrojValueError(`pattern exceeds max length ${MAX_PATTERN_LEN}`);
  }
  if (SUSPICIOUS_REGEX.test(pattern)) {
    throw new TsrojValueError(
      "pattern must not contain '{' or '}'; use fixed % tokens only"
    );
  }
  const calendar = options?.calendar || "kurdish" /* KURDISH */;
  const localeStr = options?.locale || "en" /* EN */;
  const localeId = resolveLocaleId(localeStr);
  const useLocaleDigits = options?.useLocaleDigits || false;
  const labelOverrides = mergeFormatOverrides(options);
  const padNumeric = resolveLeadingZero(localeId, options?.leadingZero);
  const locData = getLocaleData(localeId, calendar);
  let y;
  let m;
  let d;
  let wi;
  if (calendar === "kurdish" /* KURDISH */) {
    y = kd.year;
    m = kd.month;
    d = kd.day;
    wi = kd.weekdayPersian() - 1;
  } else if (calendar === "persian" /* PERSIAN */) {
    const p = kd.toPersian();
    y = p[0];
    m = p[1];
    d = p[2];
    wi = kd.weekdayPersian() - 1;
  } else if (calendar === "islamic" /* ISLAMIC */) {
    const i = kd.toIslamic();
    y = i[0];
    m = i[1];
    d = i[2];
    wi = kd.weekdayPersian() - 1;
  } else {
    const p = kd.toGregorian();
    y = p[0];
    m = p[1];
    d = p[2];
    wi = kd.weekdayGregorian();
  }
  const labels = resolveCalendarLabels(locData, m - 1, wi, options);
  let digitsMap;
  try {
    digitsMap = resolveDigits(getDigits(localeId), labelOverrides);
  } catch (err) {
    throw new TsrojValueError(
      err instanceof Error ? err.message : "invalid digits override"
    );
  }
  const parts = tokenizeList(pattern);
  const patternCtx = analyzePattern(parts);
  const applyEzafeAfterDay = resolveEzafeAfterDay(localeId, options?.ezafeAfterDay) && patternCtx.hasDay && patternCtx.hasMonthName;
  const applyEzafeOnMonth = resolveEzafeOnMonth(localeId, options?.ezafeOnMonth) && patternCtx.hasDay && patternCtx.hasMonthName && patternCtx.hasYear;
  let out = "";
  for (const seg of parts) {
    if (seg.type === "l") {
      out += seg.val;
    } else {
      const tok = seg.val;
      if (tok === "%Y") {
        out += String(y).padStart(4, "0");
      } else if (tok === "%y") {
        out += String(y % 100).padStart(2, "0");
      } else if (tok === "%B") {
        out += formatMonthName(labels.month, applyEzafeOnMonth);
      } else if (tok === "%b") {
        out += formatMonthName(labels.monthShort, applyEzafeOnMonth);
      } else if (tok === "%m" || tok === "%-m") {
        out += formatMonthNum(m, tok, padNumeric);
      } else if (tok === "%d" || tok === "%-d") {
        out += formatDay(d, tok, padNumeric, applyEzafeAfterDay);
      } else if (tok === "%A") {
        out += labels.weekday;
      } else if (tok === "%a") {
        out += labels.weekdayShort;
      } else if (tok === "%E") {
        out += labels.weekdayMin;
      } else if (tok === "%w") {
        out += String(wi + 1);
      } else if (tok === "%-w") {
        out += String(kd.weekdayPersian());
      }
    }
  }
  if (useLocaleDigits) {
    return toLocaleDigits(out, digitsMap);
  }
  return out;
}

// src/kurdish.ts
var KurdishEra = /* @__PURE__ */ ((KurdishEra2) => {
  KurdishEra2["SOLAR_PERSIAN_OFFSET"] = "solar_persian_offset";
  KurdishEra2["FALL_OF_NINEVEH"] = "fall_of_nineveh";
  return KurdishEra2;
})(KurdishEra || {});
var KurdishDate = class _KurdishDate {
  year;
  month;
  day;
  era;
  _jdn;
  constructor(year, month, day, era = "solar_persian_offset" /* SOLAR_PERSIAN_OFFSET */) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      throw new TsrojValueError("Year, month, and day must be integers");
    }
    this.era = era;
    let jalaliYear = year;
    if (era === "solar_persian_offset" /* SOLAR_PERSIAN_OFFSET */) {
      jalaliYear = year - KURDISH_SOLAR_YEAR_OFFSET;
    } else if (era === "fall_of_nineveh" /* FALL_OF_NINEVEH */) {
      jalaliYear = year - 1233;
    }
    this.year = year;
    this.month = month;
    this.day = day;
    this._jdn = persianToJdn(jalaliYear, month, day);
    const [gy] = jdnToGregorian(this._jdn);
    if (gy < MIN_SUPPORTED_YEAR || gy > MAX_SUPPORTED_YEAR) {
      throw new TsrojRangeError(
        `Computed Gregorian Year ${gy} is out of bounds`
      );
    }
  }
  static fromJdn(jdn, era = "solar_persian_offset" /* SOLAR_PERSIAN_OFFSET */) {
    const [py, pm, pd] = jdnToPersian(jdn);
    let ky = py;
    if (era === "solar_persian_offset" /* SOLAR_PERSIAN_OFFSET */) {
      ky += KURDISH_SOLAR_YEAR_OFFSET;
    } else if (era === "fall_of_nineveh" /* FALL_OF_NINEVEH */) {
      ky += 1233;
    }
    return new _KurdishDate(ky, pm, pd, era);
  }
  static fromGregorian(d, era = "solar_persian_offset" /* SOLAR_PERSIAN_OFFSET */) {
    const pyJdn = gregorianToJdn(
      d.getFullYear(),
      d.getMonth() + 1,
      d.getDate()
    );
    return _KurdishDate.fromJdn(pyJdn, era);
  }
  static fromPersian(year, month, day, era = "solar_persian_offset" /* SOLAR_PERSIAN_OFFSET */) {
    const jdn = persianToJdn(year, month, day);
    return _KurdishDate.fromJdn(jdn, era);
  }
  static fromIslamic(year, month, day, era = "solar_persian_offset" /* SOLAR_PERSIAN_OFFSET */) {
    const jdn = islamicToJdn(year, month, day);
    return _KurdishDate.fromJdn(jdn, era);
  }
  static today(era = "solar_persian_offset" /* SOLAR_PERSIAN_OFFSET */) {
    return _KurdishDate.fromGregorian(/* @__PURE__ */ new Date(), era);
  }
  static fromString(str, era = "solar_persian_offset" /* SOLAR_PERSIAN_OFFSET */) {
    if (typeof str !== "string" || !/^\d{1,4}-\d{1,2}-\d{1,2}$/.test(str)) {
      throw new TsrojValueError("Invalid string format, expected YYYY-MM-DD");
    }
    const [y, m, d] = str.split("-").map((p) => parseInt(p, 10));
    return new _KurdishDate(y, m, d, era);
  }
  toJSON() {
    return this.toString();
  }
  toString() {
    return `${this.year.toString().padStart(4, "0")}-${this.month.toString().padStart(2, "0")}-${this.day.toString().padStart(2, "0")}`;
  }
  toJdn() {
    return this._jdn;
  }
  toJSDate() {
    const [y, m, d] = jdnToGregorian(this._jdn);
    return new Date(Date.UTC(y, m - 1, d));
  }
  toGregorian() {
    return jdnToGregorian(this._jdn);
  }
  toPersian() {
    return jdnToPersian(this._jdn);
  }
  toIslamic() {
    return jdnToIslamic(this._jdn);
  }
  weekdayGregorian() {
    const jsDate = this.toJSDate();
    const jsDay = jsDate.getUTCDay();
    return jsDay === 0 ? 6 : jsDay - 1;
  }
  weekdayPersian() {
    const jsDate = this.toJSDate();
    return persianWeekdayFromGregorian(jsDate);
  }
  strftime(formatStr, opts) {
    return formatCalendarDate(this, formatStr, {
      calendar: "kurdish" /* KURDISH */,
      locale: opts?.locale || "en" /* EN */,
      ...opts
    });
  }
};
var KurdishDateTime = class _KurdishDateTime extends KurdishDate {
  hour;
  minute;
  second;
  millisecond;
  constructor(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0, era = "solar_persian_offset" /* SOLAR_PERSIAN_OFFSET */) {
    super(year, month, day, era);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || !Number.isInteger(second) || !Number.isInteger(millisecond)) {
      throw new TsrojValueError("Time components must be integers");
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59 || millisecond < 0 || millisecond > 999) {
      throw new TsrojRangeError("Time component out of bounds");
    }
    this.hour = hour;
    this.minute = minute;
    this.second = second;
    this.millisecond = millisecond;
  }
  static fromJSDate(d, era = "solar_persian_offset" /* SOLAR_PERSIAN_OFFSET */) {
    const kd = KurdishDate.fromGregorian(d, era);
    return new _KurdishDateTime(
      kd.year,
      kd.month,
      kd.day,
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      d.getMilliseconds(),
      era
    );
  }
  static now(era = "solar_persian_offset" /* SOLAR_PERSIAN_OFFSET */) {
    return _KurdishDateTime.fromJSDate(/* @__PURE__ */ new Date(), era);
  }
  static fromString(str, era = "solar_persian_offset" /* SOLAR_PERSIAN_OFFSET */) {
    if (typeof str !== "string" || !str.includes("T")) {
      throw new TsrojValueError(
        "Invalid datetime format, expected YYYY-MM-DDTHH:mm:ss"
      );
    }
    const [datePart, timePart] = str.split("T");
    const dateObj = KurdishDate.fromString(datePart, era);
    const timeReg = /^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?Z?$/;
    const match = timePart.match(timeReg);
    if (!match) {
      throw new TsrojValueError("Invalid time format, expected HH:mm:ss");
    }
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const s = parseInt(match[3], 10);
    const ms = match[4] ? parseInt(match[4].padEnd(3, "0"), 10) : 0;
    return new _KurdishDateTime(
      dateObj.year,
      dateObj.month,
      dateObj.day,
      h,
      m,
      s,
      ms,
      era
    );
  }
  toJSON() {
    return this.toString();
  }
  toString() {
    return `${super.toString()}T${this.hour.toString().padStart(2, "0")}:${this.minute.toString().padStart(2, "0")}:${this.second.toString().padStart(2, "0")}.${this.millisecond.toString().padStart(3, "0")}`;
  }
  toJSDate() {
    const [y, m, d] = this.toGregorian();
    return new Date(
      y,
      m - 1,
      d,
      this.hour,
      this.minute,
      this.second,
      this.millisecond
    );
  }
  strftime(formatStr, opts) {
    let out = super.strftime(formatStr, opts);
    const P = opts?.locale ? resolveLocaleId(opts.locale) : "en" /* EN */;
    const padTime = resolveLeadingZero(P, opts?.leadingZero);
    const pad = (n) => padTime ? String(n).padStart(2, "0") : String(n);
    const ampm = P === "ckb" /* CKB */ || P === "ar" /* AR */ || P === "fa" /* FA */ ? this.hour < 12 ? "\u067E.\u0646" : "\u062F.\u0646" : this.hour < 12 ? "AM" : "PM";
    const h12 = this.hour % 12 || 12;
    out = out.replace(/%H/g, pad(this.hour));
    out = out.replace(/%I/g, pad(h12));
    out = out.replace(/%M/g, pad(this.minute));
    out = out.replace(/%S/g, pad(this.second));
    out = out.replace(/%p/g, ampm);
    if (opts?.useLocaleDigits) {
      try {
        const digitsMap = resolveDigits(
          getDigits(P, opts),
          mergeFormatOverrides(opts)
        );
        out = toLocaleDigits(out, digitsMap);
      } catch (err) {
        throw new TsrojValueError(
          err instanceof Error ? err.message : "invalid digits override"
        );
      }
    }
    return out;
  }
};
export {
  CALENDAR_CANONICAL_OWNER,
  CalendarKind,
  KURDISH_SOLAR_YEAR_OFFSET,
  KurdishDate,
  KurdishDateTime,
  KurdishEra,
  LocaleId,
  TsrojError,
  TsrojRangeError,
  TsrojValueError,
  alignVariantList,
  formatCalendarDate,
  getAmPm,
  getDigits,
  getLocaleData,
  gregorianDateToJdn,
  gregorianToJdn,
  islamicToJdn,
  jdnToGregorian,
  jdnToGregorianDate,
  jdnToIslamic,
  jdnToPersian,
  mergeFormatOverrides,
  persianToJdn,
  resolveCalendarLabels,
  resolveDigits,
  resolveEzafeAfterDay,
  resolveEzafeOnMonth,
  resolveLeadingZero,
  resolveLocaleId,
  resolveMonthName,
  resolveVariantIndex,
  resolveVariantLabel
};
