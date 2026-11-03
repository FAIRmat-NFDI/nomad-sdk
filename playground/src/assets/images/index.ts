/**
 * Image registry. Values are URLs resolved by Vite, so they respect the deploy base path.
 * nomad-logo.svg is the official NOMAD logo as published in nomad-docs
 * (overrides/.icons/nomad/nomad-logo-unfilled.svg). Its two tones are CSS variables
 * (--nomad-logo-primary / --nomad-logo-secondary), so it is also exposed inline as
 * `NomadLogo` and coloured from theme tokens by the AppHeader — never recoloured otherwise.
 */
import logo from './nomad-logo.svg';
import NomadLogoSvg from './nomad-logo.svg?react';
import { createAssetIcon } from '../icons/createAssetIcon';

export const images = {
  logo,
} as const;

export type ImageKey = keyof typeof images;

export const NomadLogo = createAssetIcon(NomadLogoSvg, 'NomadLogo');
