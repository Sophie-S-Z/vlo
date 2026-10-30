import { Link } from "react-router";
import { SkipLink } from "@/ui/layouts";
import { Nav, PageCounter } from "./Nav";
import { AiSection } from "./sections/AiSection";
import { BookOpens } from "./sections/BookOpens";
import { Faq } from "./sections/Faq";
import { FeaturesBento } from "./sections/FeaturesBento";
import { FirstLines } from "./sections/FirstLines";
import { Footer } from "./sections/Footer";
import { Hero } from "./sections/Hero";
import { Manifesto } from "./sections/Manifesto";
import { PrivacySection } from "./sections/PrivacySection";
import { ThreeForms } from "./sections/ThreeForms";
import { WaitlistSection } from "./sections/WaitlistSection";

/** The landing page (spec 18). Complete as static HTML; effects attach later (M1a task 6). */
export function LandingPage({ appEnabled }: { appEnabled: boolean }) {
  return (
    <>
      <title>Vlo · Write in flow</title>
      <SkipLink />
      <Nav />
      <PageCounter />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        {appEnabled && (
          <p className="px-4 sm:px-8">
            <Link
              to="/app"
              className="font-mono text-sm text-accent-text underline underline-offset-4"
            >
              Open the app
            </Link>
          </p>
        )}
        <Manifesto />
        <BookOpens />
        <ThreeForms />
        <PrivacySection />
        <AiSection />
        <FeaturesBento />
        <FirstLines />
        <Faq />
        <WaitlistSection />
      </main>
      <Footer />
    </>
  );
}
