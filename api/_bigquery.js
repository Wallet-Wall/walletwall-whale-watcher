/**
 * Thin wrapper around @google-cloud/bigquery.
 * Only used when GCP_SERVICE_ACCOUNT_JSON is set — falls back to Dune otherwise.
 * Dynamic import keeps startup working even if the package isn't installed.
 */

export async function bqQuery(sql) {
  let BigQuery;
  try {
    ({ BigQuery } = await import('@google-cloud/bigquery'));
  } catch {
    throw new Error(
      'BigQuery unavailable: install @google-cloud/bigquery or set GCP_SERVICE_ACCOUNT_JSON to skip'
    );
  }

  const credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
  const bq = new BigQuery({ credentials, projectId: credentials.project_id });

  const [rows] = await bq.query({ query: sql, location: 'US' });
  return rows;
}
