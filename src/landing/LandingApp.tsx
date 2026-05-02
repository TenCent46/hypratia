import { Backdrop } from './sections/Backdrop';
import { LandingNav } from './sections/LandingNav';
import { HeroSection } from './sections/HeroSection';
import { InteractiveAppDemo } from './sections/InteractiveAppDemo';
import { FeaturesSection } from './sections/FeaturesSection';
import { PrivacySection } from './sections/PrivacySection';
import { PricingSection } from './sections/PricingSection';
import { FinalCtaSection } from './sections/FinalCtaSection';
import { LandingFooter } from './sections/LandingFooter';

export function LandingApp() {
  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <Backdrop />
      <LandingNav />
      <main className="relative">
        <HeroSection />
        <InteractiveAppDemo />
        <FeaturesSection />
        <PrivacySection />
        <PricingSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
