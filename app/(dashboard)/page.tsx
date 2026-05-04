import { Container, Stack, Typography, Box, Chip, Link } from '@mui/material';
import CampaignReportCard from '../components/CampaignReportCard';
import SearchTermsCard from '../components/SearchTermsCard';
import NgramAnalysisCard from '../components/NgramAnalysisCard';

export default function DashboardPage() {
  return (
    <Container maxWidth="xl" className="px-0">
      <Box id="overview" className="mb-8 scroll-mt-24">
        <Stack direction="row" spacing={1} alignItems="center" className="mb-2">
          <Chip label="MuscleFit" size="small" color="primary" />
          <Chip label="Google Ads" size="small" variant="outlined" />
        </Stack>
        <Typography variant="h4" component="h1" className="font-bold tracking-tight">
          Ads operator dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary" className="mt-1 max-w-3xl">
          Layout inspired by the{' '}
          <Link
            href="https://vercel.com/templates/next.js/next-js-and-shadcn-ui-admin-dashboard"
            target="_blank"
            rel="noreferrer"
            variant="body2"
            className="inline font-medium"
          >
            Vercel Next.js admin dashboard template
          </Link>
          —sidebar navigation and console shell—implemented here with MUI and Tailwind only.
          Same logic powers the CLI commands (
          <code>pnpm report</code>, <code>pnpm search-terms</code>,{' '}
          <code>pnpm ngram-analysis</code>, <code>pnpm campaign-keywords</code>
          ).
        </Typography>
      </Box>

      <Stack spacing={3}>
        <Box id="campaign-report" className="scroll-mt-24">
          <CampaignReportCard />
        </Box>
        <Box id="search-terms" className="scroll-mt-24">
          <SearchTermsCard />
        </Box>
        <Box id="ngram-analysis" className="scroll-mt-24">
          <NgramAnalysisCard />
        </Box>
      </Stack>
    </Container>
  );
}
