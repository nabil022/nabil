// The standalone demo loads React's UMD build from a CDN, which has no
// react/jsx-runtime entry. The build aliases that import to this file, which
// maps the automatic JSX runtime onto the global React.createElement.

type ReactGlobal = {
  createElement: (type: unknown, props: unknown) => unknown;
  Fragment: unknown;
};

const R = (globalThis as unknown as { React: ReactGlobal }).React;

export const Fragment = R.Fragment;

export function jsx(type: unknown, props: Record<string, unknown>, key?: unknown): unknown {
  return R.createElement(type, key === undefined ? props : { ...props, key });
}

export const jsxs = jsx;
export const jsxDEV = jsx;
