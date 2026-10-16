// Offline magnetic declination: NOAA/NCEI World Magnetic Model WMM2025 (public domain), valid 2025.0–2030.0.
// Coefficients embedded verbatim from WMM.COF (epoch 2025.0, released 11/13/2024). Standard WMM evaluation:
// geodetic → geocentric spherical, Schmidt semi-normalised associated Legendre functions, degree/order 12,
// secular variation applied linearly from the epoch. Field components X (north), Y (east); D = atan2(Y, X).

const EPOCH = 2025.0;
const N = 12;
// [n, m, g, h, g_dot, h_dot] (nT, nT/yr)
const COF: readonly (readonly number[])[] = [
  [1, 0, -29351.8, 0.0, 12.0, 0.0],
  [1, 1, -1410.8, 4545.4, 9.7, -21.5],
  [2, 0, -2556.6, 0.0, -11.6, 0.0],
  [2, 1, 2951.1, -3133.6, -5.2, -27.7],
  [2, 2, 1649.3, -815.1, -8.0, -12.1],
  [3, 0, 1361.0, 0.0, -1.3, 0.0],
  [3, 1, -2404.1, -56.6, -4.2, 4.0],
  [3, 2, 1243.8, 237.5, 0.4, -0.3],
  [3, 3, 453.6, -549.5, -15.6, -4.1],
  [4, 0, 895.0, 0.0, -1.6, 0.0],
  [4, 1, 799.5, 278.6, -2.4, -1.1],
  [4, 2, 55.7, -133.9, -6.0, 4.1],
  [4, 3, -281.1, 212.0, 5.6, 1.6],
  [4, 4, 12.1, -375.6, -7.0, -4.4],
  [5, 0, -233.2, 0.0, 0.6, 0.0],
  [5, 1, 368.9, 45.4, 1.4, -0.5],
  [5, 2, 187.2, 220.2, 0.0, 2.2],
  [5, 3, -138.7, -122.9, 0.6, 0.4],
  [5, 4, -142.0, 43.0, 2.2, 1.7],
  [5, 5, 20.9, 106.1, 0.9, 1.9],
  [6, 0, 64.4, 0.0, -0.2, 0.0],
  [6, 1, 63.8, -18.4, -0.4, 0.3],
  [6, 2, 76.9, 16.8, 0.9, -1.6],
  [6, 3, -115.7, 48.8, 1.2, -0.4],
  [6, 4, -40.9, -59.8, -0.9, 0.9],
  [6, 5, 14.9, 10.9, 0.3, 0.7],
  [6, 6, -60.7, 72.7, 0.9, 0.9],
  [7, 0, 79.5, 0.0, -0.0, 0.0],
  [7, 1, -77.0, -48.9, -0.1, 0.6],
  [7, 2, -8.8, -14.4, -0.1, 0.5],
  [7, 3, 59.3, -1.0, 0.5, -0.8],
  [7, 4, 15.8, 23.4, -0.1, 0.0],
  [7, 5, 2.5, -7.4, -0.8, -1.0],
  [7, 6, -11.1, -25.1, -0.8, 0.6],
  [7, 7, 14.2, -2.3, 0.8, -0.2],
  [8, 0, 23.2, 0.0, -0.1, 0.0],
  [8, 1, 10.8, 7.1, 0.2, -0.2],
  [8, 2, -17.5, -12.6, 0.0, 0.5],
  [8, 3, 2.0, 11.4, 0.5, -0.4],
  [8, 4, -21.7, -9.7, -0.1, 0.4],
  [8, 5, 16.9, 12.7, 0.3, -0.5],
  [8, 6, 15.0, 0.7, 0.2, -0.6],
  [8, 7, -16.8, -5.2, -0.0, 0.3],
  [8, 8, 0.9, 3.9, 0.2, 0.2],
  [9, 0, 4.6, 0.0, -0.0, 0.0],
  [9, 1, 7.8, -24.8, -0.1, -0.3],
  [9, 2, 3.0, 12.2, 0.1, 0.3],
  [9, 3, -0.2, 8.3, 0.3, -0.3],
  [9, 4, -2.5, -3.3, -0.3, 0.3],
  [9, 5, -13.1, -5.2, 0.0, 0.2],
  [9, 6, 2.4, 7.2, 0.3, -0.1],
  [9, 7, 8.6, -0.6, -0.1, -0.2],
  [9, 8, -8.7, 0.8, 0.1, 0.4],
  [9, 9, -12.9, 10.0, -0.1, 0.1],
  [10, 0, -1.3, 0.0, 0.1, 0.0],
  [10, 1, -6.4, 3.3, 0.0, 0.0],
  [10, 2, 0.2, 0.0, 0.1, -0.0],
  [10, 3, 2.0, 2.4, 0.1, -0.2],
  [10, 4, -1.0, 5.3, -0.0, 0.1],
  [10, 5, -0.6, -9.1, -0.3, -0.1],
  [10, 6, -0.9, 0.4, 0.0, 0.1],
  [10, 7, 1.5, -4.2, -0.1, 0.0],
  [10, 8, 0.9, -3.8, -0.1, -0.1],
  [10, 9, -2.7, 0.9, -0.0, 0.2],
  [10, 10, -3.9, -9.1, -0.0, -0.0],
  [11, 0, 2.9, 0.0, 0.0, 0.0],
  [11, 1, -1.5, 0.0, -0.0, -0.0],
  [11, 2, -2.5, 2.9, 0.0, 0.1],
  [11, 3, 2.4, -0.6, 0.0, -0.0],
  [11, 4, -0.6, 0.2, 0.0, 0.1],
  [11, 5, -0.1, 0.5, -0.1, -0.0],
  [11, 6, -0.6, -0.3, 0.0, -0.0],
  [11, 7, -0.1, -1.2, -0.0, 0.1],
  [11, 8, 1.1, -1.7, -0.1, -0.0],
  [11, 9, -1.0, -2.9, -0.1, 0.0],
  [11, 10, -0.2, -1.8, -0.1, 0.0],
  [11, 11, 2.6, -2.3, -0.1, 0.0],
  [12, 0, -2.0, 0.0, 0.0, 0.0],
  [12, 1, -0.2, -1.3, 0.0, -0.0],
  [12, 2, 0.3, 0.7, -0.0, 0.0],
  [12, 3, 1.2, 1.0, -0.0, -0.1],
  [12, 4, -1.3, -1.4, -0.0, 0.1],
  [12, 5, 0.6, -0.0, -0.0, -0.0],
  [12, 6, 0.6, 0.6, 0.1, -0.0],
  [12, 7, 0.5, -0.1, -0.0, -0.0],
  [12, 8, -0.1, 0.8, 0.0, 0.0],
  [12, 9, -0.4, 0.1, 0.0, -0.0],
  [12, 10, -0.2, -1.0, -0.1, -0.0],
  [12, 11, -1.3, 0.1, -0.0, 0.0],
  [12, 12, -0.7, 0.2, -0.1, -0.1]
];

const A = 6371.2; // geomagnetic reference radius (km)
const WGS_A = 6378.137;
const WGS_F = 1 / 298.257223563;
const WGS_E2 = WGS_F * (2 - WGS_F);
const RAD = Math.PI / 180;

function decimalYear(d: Date): number {
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  return y + (d.getTime() - start) / (Date.UTC(y + 1, 0, 1) - start);
}

/** Magnetic declination in degrees, east positive (WMM2025). Geodetic lat/lon, altitude above the WGS84 ellipsoid. */
export function magneticDeclinationDeg(latDeg: number, lonDeg: number, altKm = 0, date: Date = new Date()): number {
  const dt = decimalYear(date) - EPOCH;
  const lat = Math.max(-89.999, Math.min(89.999, latDeg)) * RAD;
  const lon = lonDeg * RAD;
  // geodetic → geocentric
  const sl = Math.sin(lat), cl = Math.cos(lat);
  const rc = WGS_A / Math.sqrt(1 - WGS_E2 * sl * sl);
  const xp = (rc + altKm) * cl, zp = (rc * (1 - WGS_E2) + altKm) * sl;
  const r = Math.hypot(xp, zp);
  const phi = Math.asin(zp / r); // geocentric latitude
  const mu = Math.sin(phi), s = Math.cos(phi); // cos / sin of geocentric colatitude θ

  // Schmidt semi-normalised P[n][m](cos θ) and dP/dθ
  const P: number[][] = [], dP: number[][] = [];
  for (let n = 0; n <= N; n++) { P.push(new Array(N + 1).fill(0)); dP.push(new Array(N + 1).fill(0)); }
  P[0][0] = 1;
  for (let n = 1; n <= N; n++) {
    const k = n === 1 ? 1 : Math.sqrt((2 * n - 1) / (2 * n));
    P[n][n] = k * s * P[n - 1][n - 1];
    dP[n][n] = k * (s * dP[n - 1][n - 1] + mu * P[n - 1][n - 1]);
    for (let m = 0; m < n; m++) {
      const d = Math.sqrt(n * n - m * m);
      const c = m <= n - 2 ? Math.sqrt((n - 1) * (n - 1) - m * m) : 0;
      const p2 = m <= n - 2 ? P[n - 2][m] : 0, dp2 = m <= n - 2 ? dP[n - 2][m] : 0;
      P[n][m] = ((2 * n - 1) * mu * P[n - 1][m] - c * p2) / d;
      dP[n][m] = ((2 * n - 1) * (mu * dP[n - 1][m] - s * P[n - 1][m]) - c * dp2) / d;
    }
  }

  let xg = 0, yg = 0, zg = 0; // geocentric north, east, down
  for (const [n, m, g0, h0, gd, hd] of COF) {
    const g = g0 + gd * dt, h = h0 + hd * dt;
    const ar = (A / r) ** (n + 2);
    const cm = Math.cos(m * lon), sm = Math.sin(m * lon);
    xg += ar * (g * cm + h * sm) * dP[n][m];
    yg += ar * m * (g * sm - h * cm) * P[n][m];
    zg -= ar * (n + 1) * (g * cm + h * sm) * P[n][m];
  }
  yg /= s;
  const psi = phi - lat; // geocentric → geodetic rotation
  const x = xg * Math.cos(psi) - zg * Math.sin(psi);
  return Math.atan2(yg, x) / RAD;
}

/** Magnetic heading from a true heading and an east-positive declination, in [0, 360). */
export function trueToMagnetic(trueHdg: number, decl: number): number {
  return (((trueHdg - decl + 360) % 360) + 360) % 360;
}
