import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig, motion } from "motion/react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig, FACTORY, COINS, FORK_RPC, basescan } from "./lib/chain";
import { Wallet } from "./components/Wallet";
import { Logo } from "./components/Logo";
import { Home } from "./pages/Home";
import { CreateLeague } from "./pages/Create";
import { LeaguePage } from "./pages/League";
import "./styles.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

const NAV = [
  { label: "Start a league", to: "/new" },
  { label: "Leagues", href: "/#leagues" },
  { label: "Source", href: "https://github.com/neromtoobad/hostile", external: true },
];

/** Floating pill nav. It narrows once you scroll, and a soft pill follows the link you hover. */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={`top ${scrolled ? "scrolled" : ""}`}>
      <div className="top-in">
        <Link to="/" className="wordmark"><Logo /></Link>
        <nav className="top-nav" onMouseLeave={() => setHover(null)}>
          {NAV.map((n) => {
            const inner = (
              <>
                {hover === n.label && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <span>{n.label}</span>
              </>
            );
            return n.to ? (
              <Link key={n.label} to={n.to} onMouseEnter={() => setHover(n.label)}>{inner}</Link>
            ) : (
              <a key={n.label} href={n.href} onMouseEnter={() => setHover(n.label)} {...(n.external ? { target: "_blank", rel: "noreferrer" } : {})}>{inner}</a>
            );
          })}
        </nav>
        <Wallet />
      </div>
    </header>
  );
}

function Shell() {
  const { pathname } = useLocation();
  const home = pathname === "/";
  return (
    <MotionConfig reducedMotion="user">
      {FORK_RPC && <div className="fork-banner">Local fork of Base at {FORK_RPC}. Nothing here is real money.</div>}
      <Nav />
      <main className={home ? "" : "main-app"}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<div className="wrap page-pad page-in"><CreateLeague /></div>} />
          <Route path="/l/:address" element={<div className="wrap page-pad page-in"><LeaguePage /></div>} />
        </Routes>
      </main>
      <footer className="foot">
        <div className="wrap foot-in">
          <div className="foot-top">
            <Logo />
            <p className="foot-links">
              <a href={basescan("address", FACTORY)} target="_blank" rel="noreferrer">League factory ↗</a>
              <a href={basescan("address", COINS)} target="_blank" rel="noreferrer">League coins ↗</a>
              <a href="https://github.com/neromtoobad/hostile" target="_blank" rel="noreferrer">Source ↗</a>
            </p>
          </div>
          <p className="foot-note">
            Shares are Coinbase-issued stock tokens on Base, bought on Aerodrome. Not available to US persons.
            Stock prices go down as well as up; you can lose your entry.
          </p>
        </div>
        <div className="foot-mark" aria-hidden="true">hostile</div>
      </footer>
    </MotionConfig>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
