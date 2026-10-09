type HostProvider = {
  isMiniPay?: boolean;
  isMetaMask?: boolean;
};

export type WalletHost = "minipay" | "metamask" | "injected" | "none" | "server";

// Read at error time. MiniPay also sets isMetaMask, so that flag is second.
export function clientWalletHost(): WalletHost {
  if (typeof window === "undefined") return "server";
  const eth = (window as { ethereum?: HostProvider }).ethereum;
  if (!eth) return "none";
  if (eth.isMiniPay === true) return "minipay";
  if (eth.isMetaMask === true) return "metamask";
  return "injected";
}
