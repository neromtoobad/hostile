import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig, FACTORY, COINS, FORK_RPC, basescan } from "./lib/chain";
import { Wallet } from "./components/Wallet";
import { Home } from "./pages/Home";
import { CreateLeague } from "./pages/Create";
import { LeaguePage } from "./pages/League";
import "./styles.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

function Shell() {
  return (
    <>
      {FORK_RPC && <div className="fork-banner">Local fork of Base at {FORK_RPC}. Nothing here is real money.</div>}
      <header className="top">
        <Link to="/" className="wordmark">HOSTILE</Link>
        <nav className="top-nav">
          <Link to="/new">Start a league</Link>
        </nav>
        <Wallet />
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<CreateLeague />} />
          <Route path="/l/:address" element={<LeaguePage />} />
        </Routes>
      </main>
      <footer className="foot">
        <p>
          Shares are Coinbase-issued stock tokens on Base, bought on Aerodrome. Not available to US persons.
          Stock prices go down as well as up; you can lose your entry.
        </p>
        <p className="foot-links">
          <a href={basescan("address", FACTORY)} target="_blank" rel="noreferrer">League factory</a>
          <a href={basescan("address", COINS)} target="_blank" rel="noreferrer">League coins</a>
          <a href="https://github.com/neromtoobad/hostile" target="_blank" rel="noreferrer">Source</a>
        </p>
      </footer>
    </>
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
