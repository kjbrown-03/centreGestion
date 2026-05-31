import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Hero } from "@/components/site/Hero";
import { Services } from "@/components/site/Services";
import { Stats } from "@/components/site/Stats";
import { About } from "@/components/site/About";
import { Team } from "@/components/site/Team";
import { MapSection } from "@/components/site/MapSection";
import { Footer } from "@/components/site/Footer";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <Services />
      <Stats />
      <About />
      <Team />
      <MapSection />
      <Footer />
    </main>
  );
}
