import { PageHeader, SearchForm, DataTable } from "../components";
import {
  ownersOfCompany, companiesOfPerson, ownerEmpires,
  type CompanyOwner, type PersonCompanies,
} from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const [companies, people, empires] = await Promise.all([
    q ? ownersOfCompany(q) : Promise.resolve([] as CompanyOwner[]),
    q ? companiesOfPerson(q) : Promise.resolve([] as PersonCompanies[]),
    q ? Promise.resolve([] as PersonCompanies[]) : ownerEmpires(2),
  ]);

  return (
    <div>
      <PageHeader
        title="Owner Search"
        subtitle="Search a company to see who runs it — or search a person to see every company they run."
      />

      <SearchForm
        action="/search"
        name="q"
        label="Search"
        placeholder="Company or person name (e.g. Casita Coffee, or Sarkis)"
        defaultValue={q}
      />

      {q && (
        <>
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Companies matching “{q}” → who runs them
            </h2>
            <DataTable<CompanyOwner>
              rows={companies}
              empty="No companies matched."
              columns={[
                { key: "entity_name", label: "Company", className: "font-medium text-slate-900" },
                { key: "first_name", label: "Owner / principal", render: (r) => `${r.first_name} ${r.last_name}` },
                { key: "position_type", label: "Role" },
                { key: "entity_type", label: "Entity type", render: (r) => <span className="text-slate-500">{r.entity_type}</span> },
                { key: "city", label: "City" },
              ]}
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              People matching “{q}” → every company they run
            </h2>
            <DataTable<PersonCompanies>
              rows={people}
              empty="No people matched."
              columns={[
                { key: "last", label: "Person", className: "font-medium text-slate-900", render: (r) => `${r.first} ${r.last}` },
                { key: "companies", label: "# Companies", className: "text-center" },
                { key: "company_list", label: "Companies", render: (r) => <span className="text-slate-500">{r.company_list}</span> },
              ]}
            />
          </section>
        </>
      )}

      {!q && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            People running multiple companies (owner empires) — the reverse-lookup in action
          </h2>
          <DataTable<PersonCompanies>
            rows={empires}
            empty="No data."
            columns={[
              { key: "last", label: "Person", className: "font-medium text-slate-900", render: (r) => `${r.first} ${r.last}` },
              { key: "companies", label: "# Companies", className: "text-center" },
              { key: "company_list", label: "Companies they run", render: (r) => <span className="text-slate-500">{r.company_list}</span> },
            ]}
          />
        </section>
      )}
    </div>
  );
}
