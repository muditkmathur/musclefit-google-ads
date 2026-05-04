'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import type { NgramAnalysisResult } from '@/types/google-ads';
import { getNgramAnalysis } from '@/app/actions/google-ads';

const WEIGHTS = ['count', 'clicks', 'impressions', 'cost'] as const;

export default function NgramAnalysisCard() {
  const [months, setMonths] = useState<number>(3);
  const [campaign, setCampaign] = useState<string>('');
  const [weight, setWeight] = useState<(typeof WEIGHTS)[number]>('count');
  const [top, setTop] = useState<number>(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NgramAnalysisResult | null>(null);
  const [tab, setTab] = useState<string>('1');

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const result = await getNgramAnalysis({
        months,
        campaign: campaign.trim() || null,
        options: { weight, top },
      });
      if (!result.ok) throw new Error(result.error);
      setResult(result.data);
      const firstN = result.data.params.n[0];
      if (firstN) setTab(String(firstN));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card variant="outlined" className="rounded-xl">
      <CardHeader
        title="N-Gram Analysis"
        subheader="Live n-gram analysis from search-term data."
      />
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ sm: 'center' }}
          className="mb-4"
          useFlexGap
          flexWrap="wrap"
        >
          <TextField
            type="number"
            label="Months"
            size="small"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value) || 3)}
            inputProps={{ min: 1, max: 24 }}
            className="w-full sm:w-28"
          />
          <TextField
            label="Campaign filter"
            size="small"
            placeholder="e.g. WhatsApp"
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            className="flex-1 min-w-[160px]"
          />
          <TextField
            select
            size="small"
            label="Weight"
            value={weight}
            onChange={(e) => setWeight(e.target.value as (typeof WEIGHTS)[number])}
            className="w-full sm:w-40"
          >
            {WEIGHTS.map((w) => (
              <MenuItem key={w} value={w}>
                {w}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="number"
            label="Top per N"
            size="small"
            value={top}
            onChange={(e) => setTop(Number(e.target.value) || 50)}
            inputProps={{ min: 5, max: 500 }}
            className="w-full sm:w-32"
          />
          <Button
            variant="contained"
            onClick={run}
            disabled={loading}
            startIcon={
              loading ? <CircularProgress size={16} color="inherit" /> : null
            }
          >
            {loading ? 'Analyzing…' : 'Analyze'}
          </Button>
        </Stack>

        {error && (
          <Alert severity="error" className="mb-4">
            {error}
          </Alert>
        )}

        {result && (
          <Box>
            <Typography variant="body2" color="text.secondary" className="mb-2">
              {result.totals.rows} rows analyzed (of {result.totals.rowsBeforeCampaignFilter}) ·
              weight={result.weight}
              {result.campaign ? ` · filter: "${result.campaign}"` : ''}
            </Typography>
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v as string)}
              variant="scrollable"
              scrollButtons="auto"
            >
              {result.params.n.map((n) => (
                <Tab key={n} value={String(n)} label={`${n}-gram`} />
              ))}
            </Tabs>
            <Box className="mt-3">
              <TableContainer
                component="div"
                className="border rounded-lg max-h-[480px] overflow-auto"
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>N-gram</TableCell>
                      <TableCell align="right">Count</TableCell>
                      <TableCell align="right">Score</TableCell>
                      <TableCell align="right">Clicks</TableCell>
                      <TableCell align="right">Impr.</TableCell>
                      <TableCell align="right">Cost</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(result.ngrams[tab] ?? []).map((row) => (
                      <TableRow key={row.ngram} hover>
                        <TableCell className="font-medium">{row.ngram}</TableCell>
                        <TableCell align="right">{row.count}</TableCell>
                        <TableCell align="right">
                          {Number.isFinite(row.score) ? row.score.toFixed(2) : '0.00'}
                        </TableCell>
                        <TableCell align="right">{row.clicks.toLocaleString()}</TableCell>
                        <TableCell align="right">{row.impressions.toLocaleString()}</TableCell>
                        <TableCell align="right">₹{row.cost.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
