// Settings for the water effect. The names are the original demo's, so its documentation and demo
// page still apply; the values are tuned for paint on a white page instead of light on black.

export interface FluidConfig {
  SIM_RESOLUTION: number;
  DYE_RESOLUTION: number;
  DENSITY_DISSIPATION: number;
  VELOCITY_DISSIPATION: number;
  PRESSURE: number;
  PRESSURE_ITERATIONS: number;
  CURL: number;
  SPLAT_RADIUS: number;
  SPLAT_FORCE: number;
  SHADING: boolean;
  COLORFUL: boolean;
  COLOR_UPDATE_SPEED: number;
  // Scales the random dye colour. The demo's 0.15 suits black; paint on white needs more.
  COLOR_INTENSITY: number;
  BLOOM: boolean;
  BLOOM_ITERATIONS: number;
  BLOOM_RESOLUTION: number;
  BLOOM_INTENSITY: number;
  BLOOM_THRESHOLD: number;
  BLOOM_SOFT_KNEE: number;
  SUNRAYS: boolean;
  SUNRAYS_RESOLUTION: number;
  SUNRAYS_WEIGHT: number;
  // A mouse stirs the water just by moving. Touch and pen always need contact, as before.
  HOVER: boolean;
  // Random splats painted when the effect starts. The home page starts pure white, so 0.
  INITIAL_SPLATS: number;
  // Upper limit for the canvas pixel ratio (see effectivePixelRatio).
  MAX_PIXEL_RATIO: number;
  // When nobody touches the screen for a moment, a slow swirl wanders over it (see autopilot.ts). On for
  // phones, where there is no hovering mouse to make the page move; off on a desktop.
  AUTOPILOT: boolean;
}

// The reference page's actual settings, read from its published JavaScript (2026-10-30). Its control
// panel screenshot showed other values; these are what the page really runs. Key traits: colours are
// dim (0.15) and change about ten times a second while the pointer moves, so strokes are a soft mix
// of many hues; dye fades slowly (0.5), so strokes layer; low pressure and a little curl give the
// thin streaks; no bloom and no sunrays.
export const DEFAULT_CONFIG: FluidConfig = {
  SIM_RESOLUTION: 128,
  DYE_RESOLUTION: 1440,
  DENSITY_DISSIPATION: 0.5,
  VELOCITY_DISSIPATION: 3,
  PRESSURE: 0.1,
  PRESSURE_ITERATIONS: 20,
  CURL: 3,
  SPLAT_RADIUS: 0.2,
  SPLAT_FORCE: 6000,
  SHADING: true,
  COLORFUL: true,
  COLOR_UPDATE_SPEED: 10,
  COLOR_INTENSITY: 0.15,
  BLOOM: false,
  BLOOM_ITERATIONS: 8,
  BLOOM_RESOLUTION: 256,
  BLOOM_INTENSITY: 0.8,
  BLOOM_THRESHOLD: 0.6,
  BLOOM_SOFT_KNEE: 0.7,
  SUNRAYS: false,
  SUNRAYS_RESOLUTION: 196,
  SUNRAYS_WEIGHT: 1.0,
  HOVER: true,
  INITIAL_SPLATS: 0,
  MAX_PIXEL_RATIO: 1.5,
  AUTOPILOT: false,
};

export interface DeviceCapabilities {
  mobile: boolean;
  // OES_texture_float_linear (WebGL2) or OES_texture_half_float_linear (WebGL1).
  linearFiltering: boolean;
}

// Device rules. Like the demo, a GPU without linear filtering gets a smaller dye texture and loses the effects
// that need it. Phones get a lighter simulation than the demo's (a quarter of the grid cells, a smaller dye
// texture, fewer pressure passes, one canvas pixel per CSS pixel), because the owner measured about 30 frames a
// second on an iPhone with the demo's phone settings; they also get the autopilot. If it is still too slow,
// quality.ts steps it down further while it runs.
export function resolveConfig(overrides: Partial<FluidConfig>, caps: DeviceCapabilities): FluidConfig {
  const config: FluidConfig = { ...DEFAULT_CONFIG, ...overrides };
  if (caps.mobile) {
    config.SIM_RESOLUTION = Math.min(config.SIM_RESOLUTION, 64);
    config.DYE_RESOLUTION = Math.min(config.DYE_RESOLUTION, 384);
    config.PRESSURE_ITERATIONS = Math.min(config.PRESSURE_ITERATIONS, 12);
    config.MAX_PIXEL_RATIO = Math.min(config.MAX_PIXEL_RATIO, 1);
    if (overrides.AUTOPILOT === undefined) config.AUTOPILOT = true;
  }
  if (!caps.linearFiltering) {
    config.DYE_RESOLUTION = Math.min(config.DYE_RESOLUTION, 512);
    config.SHADING = false;
    config.BLOOM = false;
    config.SUNRAYS = false;
  }
  return config;
}
