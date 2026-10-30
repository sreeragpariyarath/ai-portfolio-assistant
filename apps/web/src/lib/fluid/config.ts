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
}

// The values of the reference page's own control panel (the owner copied them from its dat.GUI):
// quality high, sim resolution 256, density diffusion 2.5, velocity diffusion 3.71, pressure 0.6,
// vorticity 0, splat radius 0.23, shading on, colorful off, bloom on (intensity 1, threshold 1),
// sunrays on (weight 1). They give the calm, water-like movement of that page.
export const DEFAULT_CONFIG: FluidConfig = {
  SIM_RESOLUTION: 256,
  DYE_RESOLUTION: 1024,
  DENSITY_DISSIPATION: 2.5,
  VELOCITY_DISSIPATION: 3.71,
  PRESSURE: 0.6,
  PRESSURE_ITERATIONS: 20,
  CURL: 0,
  SPLAT_RADIUS: 0.23,
  SPLAT_FORCE: 6000,
  SHADING: true,
  COLORFUL: false,
  COLOR_UPDATE_SPEED: 10,
  COLOR_INTENSITY: 0.5,
  BLOOM: true,
  BLOOM_ITERATIONS: 8,
  BLOOM_RESOLUTION: 256,
  BLOOM_INTENSITY: 1,
  BLOOM_THRESHOLD: 1,
  BLOOM_SOFT_KNEE: 0.7,
  SUNRAYS: true,
  SUNRAYS_RESOLUTION: 196,
  SUNRAYS_WEIGHT: 1.0,
  HOVER: true,
  INITIAL_SPLATS: 0,
  MAX_PIXEL_RATIO: 1.5,
};

export interface DeviceCapabilities {
  mobile: boolean;
  // OES_texture_float_linear (WebGL2) or OES_texture_half_float_linear (WebGL1).
  linearFiltering: boolean;
}

// The same device rules as the demo: phones and GPUs without linear filtering get a smaller dye
// texture, and without linear filtering the effects that need it are switched off.
export function resolveConfig(overrides: Partial<FluidConfig>, caps: DeviceCapabilities): FluidConfig {
  const config: FluidConfig = { ...DEFAULT_CONFIG, ...overrides };
  if (caps.mobile) config.DYE_RESOLUTION = Math.min(config.DYE_RESOLUTION, 512);
  if (!caps.linearFiltering) {
    config.DYE_RESOLUTION = Math.min(config.DYE_RESOLUTION, 512);
    config.SHADING = false;
    config.BLOOM = false;
    config.SUNRAYS = false;
  }
  return config;
}
