export const Platform = {
  OS: "ios",
  select: <T,>(options: { ios?: T; android?: T; web?: T; default?: T }) => options.ios ?? options.default,
};

export const Alert = {
  alert: () => undefined,
};
