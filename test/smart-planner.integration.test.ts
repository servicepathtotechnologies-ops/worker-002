import request from 'supertest';
import app from '../src/index';

describe('Smart Planner – End-to-End', () => {
  it('should generate a minimal workflow for a clear Sheets → HubSpot prompt', async () => {
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'Get emails from Google Sheets and create contact in HubSpot.' })
      .expect(200);

    expect(res.body).toHaveProperty('sessionId');
    expect(res.body.spec).toBeDefined();
    expect(res.body.spec.data_sources).toContain('google_sheets');
    expect(res.body.spec.actions).toContain('hubspot.create_contact');
  });
});

