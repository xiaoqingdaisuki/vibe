export interface PwaInstallEnvironment {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  isStandalone: boolean;
}

// 判断当前浏览器是否需要展示 iOS 的手动安装引导
export function shouldShowIosInstallGuide(environment: PwaInstallEnvironment): boolean {
  const isIPhoneOrIPad = /iPad|iPhone|iPod/.test(environment.userAgent);
  const isIPadOsDesktopSignature = environment.platform === 'MacIntel' && environment.maxTouchPoints > 1;

  return (isIPhoneOrIPad || isIPadOsDesktopSignature) && !environment.isStandalone;
}
