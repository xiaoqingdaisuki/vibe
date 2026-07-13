import { EmptyState } from '@/components/shared/EmptyState';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { LabCard } from '@/features/lab/components/LabCard';
import { getLabApps } from '@/features/lab/lib/get-lab-apps';

export const metadata = {
  title: 'Lab',
  description: 'Interactive apps, tools and experiments.',
};

export default async function LabPage() {
  const apps = getLabApps();

  return (
    <div className="page-enter">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <span className="eyebrow">Apps</span>
        <SectionTitle title="Lab" subtitle="Interactive apps, tools, games, AI demos and experiments." />

        {apps.length === 0 ? (
          <div className="mt-6 md:mt-8">
            <EmptyState
              title="No lab apps yet"
              description="Add an app under src/features/apps/, register it in the lab registry, and expose it through the app loader map."
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-5 md:mt-8 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {apps.map((app) => (
              <LabCard key={app.slug} app={app} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
