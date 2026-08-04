// Client-safe catalog of supported providers. No secrets, no server imports.

export type ProviderId =
  | "casa_dos_dados"
  | "kipflow"
  | "apify"
  | "google_maps"
  | "linkedin_companies"
  | "linkedin_people"
  | "instagram_companies"
  | "corporate_sites"
  | "custom_api"
  | "webhook"
  | "apollo"
  | "hunter"
  | "dropcontact"
  | "rocketreach"
  | "people_data_labs"
  | "neverbounce"
  | "zerobounce";

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  description: string;
  capabilities: string[];
  formSchema: "casa_dos_dados" | "kipflow" | "apify" | "custom_rest" | "webhook";
  adapterAvailable: boolean;
  defaultBaseUrl?: string;
}

export const PROVIDER_CATALOG: ProviderMeta[] = [
  {
    id: "casa_dos_dados",
    name: "Casa dos Dados",
    description: "Descoberta empresarial por CNAE, UF e cidade (CNPJ Brasil).",
    capabilities: ["discovery.companies"],
    formSchema: "casa_dos_dados",
    adapterAvailable: true,
    defaultBaseUrl: "https://api.casadosdados.com.br/v5",
  },
  {
    id: "kipflow",
    name: "Kipflow",
    description: "Enriquecimento empresarial e profissional (decisores).",
    capabilities: ["enrichment.company", "enrichment.decision_makers"],
    formSchema: "kipflow",
    adapterAvailable: true,
    defaultBaseUrl: "https://api.kipflow.io/companies/v1",
  },
  {
    id: "apify",
    name: "Apify",
    description: "Atores para Google Maps, LinkedIn e Instagram.",
    capabilities: ["discovery.google_maps", "discovery.linkedin", "discovery.instagram"],
    formSchema: "apify",
    adapterAvailable: true,
    defaultBaseUrl: "https://api.apify.com/v2",
  },
  {
    id: "google_maps",
    name: "Google Maps (via Apify)",
    description: "Descoberta de estabelecimentos por região e categoria.",
    capabilities: ["discovery.google_maps"],
    formSchema: "apify",
    adapterAvailable: true,
  },
  {
    id: "linkedin_companies",
    name: "LinkedIn Empresas",
    description: "Descoberta de empresas via LinkedIn.",
    capabilities: ["discovery.linkedin_companies"],
    formSchema: "apify",
    adapterAvailable: true,
  },
  {
    id: "linkedin_people",
    name: "LinkedIn Pessoas",
    description: "Descoberta de decisores via LinkedIn.",
    capabilities: ["discovery.linkedin_people"],
    formSchema: "apify",
    adapterAvailable: true,
  },
  {
    id: "instagram_companies",
    name: "Instagram Empresas",
    description: "Descoberta de perfis comerciais no Instagram.",
    capabilities: ["discovery.instagram"],
    formSchema: "apify",
    adapterAvailable: true,
  },
  {
    id: "corporate_sites",
    name: "Sites Corporativos",
    description: "Scraping controlado de sites corporativos permitidos.",
    capabilities: ["enrichment.web"],
    formSchema: "custom_rest",
    adapterAvailable: true,
  },
  {
    id: "custom_api",
    name: "API REST Personalizada",
    description: "Conector declarativo com proteção anti-SSRF.",
    capabilities: ["custom"],
    formSchema: "custom_rest",
    adapterAvailable: true,
  },
  {
    id: "webhook",
    name: "Webhook",
    description: "Endpoint próprio do JCS SDR para recebimento assinado.",
    capabilities: ["ingest.webhook"],
    formSchema: "webhook",
    adapterAvailable: true,
  },
  { id: "apollo", name: "Apollo", description: "Adapter em breve.", capabilities: ["enrichment.people"], formSchema: "custom_rest", adapterAvailable: false },
  { id: "hunter", name: "Hunter", description: "Adapter em breve.", capabilities: ["enrichment.email"], formSchema: "custom_rest", adapterAvailable: false },
  { id: "dropcontact", name: "Dropcontact", description: "Adapter em breve.", capabilities: ["enrichment.email"], formSchema: "custom_rest", adapterAvailable: false },
  { id: "rocketreach", name: "RocketReach", description: "Adapter em breve.", capabilities: ["enrichment.people"], formSchema: "custom_rest", adapterAvailable: false },
  { id: "people_data_labs", name: "People Data Labs", description: "Adapter em breve.", capabilities: ["enrichment.people"], formSchema: "custom_rest", adapterAvailable: false },
  { id: "neverbounce", name: "NeverBounce", description: "Adapter em breve.", capabilities: ["validation.email"], formSchema: "custom_rest", adapterAvailable: false },
  { id: "zerobounce", name: "ZeroBounce", description: "Adapter em breve.", capabilities: ["validation.email"], formSchema: "custom_rest", adapterAvailable: false },
];

export function getProviderMeta(id: string): ProviderMeta | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}