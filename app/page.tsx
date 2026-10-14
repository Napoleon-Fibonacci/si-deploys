import type { Metadata } from "next";
import Background from "@/components/Background";
import Capacity from "@/components/Capacity";
import DeployForm from "@/components/DeployForm";
import DeletedList from "@/components/DeletedList";
import SideIcons from "@/components/SideIcons";
import { IconRocket } from "@/components/icons";
import { OPEN_GRAPH, SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...OPEN_GRAPH, url: "/" },
};

/** Data terstruktur: membantu mesin pencari memasangkan nama, URL, dan fungsi. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE.url}/#website`,
      url: `${SITE.url}/`,
      name: SITE.name,
      description: SITE.description,
      inLanguage: "id-ID",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE.url}/#app`,
      name: SITE.name,
      url: `${SITE.url}/`,
      description: SITE.description,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "IDR" },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c"),
        }}
      />
      <Background />
      <SideIcons />
      <div className="app">
        <header className="appbar">
          <div className="appbar-inner">
            <span className="wordmark">
              <IconRocket size={16} />
              Si Deploy
            </span>
            <Capacity />
          </div>
        </header>

        <main className="app-main">
          <div className="stack reveal">
            <header>
              <h1 className="stack-title">Deploy situs ke Vercel</h1>
              <p className="lead">Isi nama, pilih sumber, lalu deploy.</p>
            </header>
            <DeployForm />
            <DeletedList />
          </div>
        </main>
      </div>
    </>
  );
}
