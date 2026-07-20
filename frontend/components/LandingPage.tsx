import Link from "next/link";
import Image from "next/image";

const FEATURES: {
  title: string;
  body: string;
  screenshot: string;
  alt: string;
}[] = [
  {
    title: "Ask AI or write SQL",
    body: "Type a question in plain English — Querywise generates SQL using your schema as context, shows it to you before running, and renders the result as a chart or table. Switch to SQL mode any time to write or edit directly.",
    screenshot: "/screenshots/query-editor.png",
    alt: "Query editor showing an AI-generated SQL query and chart result",
  },
  {
    title: "Dashboards",
    body: "Build dashboards from saved queries. Drag to resize tiles, share with collaborators, rename everything inline.",
    screenshot: "/screenshots/dashboards.png",
    alt: "Dashboard grid with multiple chart tiles",
  },
  {
    title: "Queries",
    body: "Every query is saved and searchable. Open any past query in the editor, rename it, add it to a dashboard, or export results as CSV or PNG.",
    screenshot: "/screenshots/queries.png",
    alt: "List of saved queries",
  },
  {
    title: "Connections",
    body: "Connect Postgres or Snowflake, or import public datasets directly from data.gov — no ETL required. Each connection introspects the schema automatically and scopes AI context to that connection.",
    screenshot: "/screenshots/connections.png",
    alt: "Connections page listing warehouse and open-data sources",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <div className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center text-white text-xs font-bold">Q</div>
            <span className="text-sm font-semibold text-gray-100">Querywise</span>
          </div>
          <Link
            href="/login"
            className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div
        className="px-4 pt-20 pb-16 text-center"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      >
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-gray-50 max-w-2xl mx-auto">
          Ask your data questions in plain English
        </h1>
        <p className="text-base sm:text-lg text-gray-400 max-w-xl mx-auto mt-4">
          Connect your warehouse, ask a question, get SQL and a chart. Querywise is an AI-powered
          BI tool for analytics engineers and the business users who depend on them.
        </p>
        <div className="flex items-center justify-center gap-3 mt-8">
          <Link
            href="/login?mode=sign_up"
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
          >
            Get started free
          </Link>
          <Link
            href="/login"
            className="px-5 py-2.5 rounded-lg border border-gray-700 hover:border-gray-500 text-sm font-medium text-gray-200 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-4 py-16 space-y-20">
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className={`flex flex-col ${i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"} items-center gap-8 md:gap-12`}
          >
            <div className="flex-1 space-y-3">
              <h2 className="text-2xl font-semibold text-gray-100 tracking-tight">{f.title}</h2>
              <p className="text-sm text-gray-400 leading-relaxed">{f.body}</p>
            </div>
            <div className="flex-1 w-full">
              <div className="rounded-xl border border-gray-800 overflow-hidden bg-gray-900 shadow-2xl">
                <Image
                  src={f.screenshot}
                  alt={f.alt}
                  width={960}
                  height={600}
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Secondary features row */}
      <div className="max-w-5xl mx-auto px-4 pb-20 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1.5">
          <h3 className="text-sm font-semibold text-gray-100">Bring your own AI key</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Use DeepSeek (default), OpenAI, or OpenRouter. Your key is stored encrypted and takes
            priority over the platform default.
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1.5">
          <h3 className="text-sm font-semibold text-gray-100">9 chart types out of the box</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Line, bar, scatter, area, histogram, KPI, donut, heatmap, pivot table — chart type
            auto-selected from result shape, override any time.
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1.5">
          <h3 className="text-sm font-semibold text-gray-100">Public datasets, no ETL</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Import datasets straight from data.gov and start asking questions in minutes — no
            warehouse setup required.
          </p>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="border-t border-gray-800 px-4 py-14 text-center">
        <h2 className="text-xl font-semibold text-gray-100">Connect your data and start asking questions.</h2>
        <Link
          href="/login?mode=sign_up"
          className="inline-block mt-5 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
        >
          Get started free
        </Link>
      </div>
    </main>
  );
}
