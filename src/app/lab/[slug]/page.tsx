import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { getLabAppLoader } from '@/features/apps/loaders';
import { getLabAppBySlug, getAllLabAppSlugs } from '@/features/lab/lib/get-lab-apps';

interface LabAppPageProps {
  params: Promise<{ slug: string }>;
}

interface ComingSoonAppProps {
  title: string;
}

// 占位组件，显示应用尚未上线的提示信息
function ComingSoonApp({ title }: ComingSoonAppProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 md:py-24 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 bg-wash">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <h2 className="text-xl font-bold font-display text-primary">Coming Soon</h2>
      <p className="mt-2 text-sm md:text-base text-muted">{title} is still under development.</p>
    </div>
  );
}

export async function generateStaticParams() {
  const slugs = getAllLabAppSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: LabAppPageProps) {
  const { slug } = await params;
  const app = getLabAppBySlug(slug);

  if (!app) {
    return { title: 'App Not Found' };
  }

  return {
    title: app.title,
    description: app.description,
  };
}

// Lab应用详情页，根据slug动态加载并渲染对应应用
export default async function LabAppPage({ params }: LabAppPageProps) {
  const { slug } = await params;
  const app = getLabAppBySlug(slug);

  if (!app) {
    notFound();
  }

  const loadApp = getLabAppLoader(app.slug);

  if (!loadApp) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <Breadcrumb items={[{ label: 'Lab', href: '/lab' }, { label: app.title }]} />
        <ComingSoonApp title={app.title} />
      </div>
    );
  }

  const loadedApp = await loadApp();
  const AppComponent = loadedApp.default;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
      <Breadcrumb items={[{ label: 'Lab', href: '/lab' }, { label: app.title }]} />
      <AppComponent />
    </div>
  );
}
