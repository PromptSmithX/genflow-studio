import { JobDetail } from "@/components/history/job-detail";

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return (
    <div className="mx-auto max-w-5xl">
      <JobDetail jobId={jobId} />
    </div>
  );
}
