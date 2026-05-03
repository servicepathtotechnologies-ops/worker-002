import fs from 'fs';
import path from 'path';

const infraDir = path.resolve(__dirname, '../../infra');

describe('high-scale infra config', () => {
  it('defines three nginx upstream app servers with keepalive', () => {
    const nginx = fs.readFileSync(path.join(infraDir, 'nginx.conf'), 'utf8');
    expect(nginx).toContain('worker_processes auto');
    expect(nginx).toContain('server app1:3001');
    expect(nginx).toContain('server app2:3001');
    expect(nginx).toContain('server app3:3001');
    expect(nginx).toContain('keepalive 32');
  });

  it('defines Redis, Kafka, Zookeeper, Nginx, and three app services', () => {
    const compose = fs.readFileSync(path.join(infraDir, 'docker-compose.yml'), 'utf8');
    for (const service of ['nginx:', 'app1:', 'app2:', 'app3:', 'redis:', 'kafka:', 'zookeeper:']) {
      expect(compose).toContain(service);
    }
  });

  it('sets the Kubernetes HPA bounds and CPU threshold', () => {
    const hpa = fs.readFileSync(path.join(infraDir, 'k8s-hpa.yaml'), 'utf8');
    expect(hpa).toContain('minReplicas: 3');
    expect(hpa).toContain('maxReplicas: 20');
    expect(hpa).toContain('averageUtilization: 70');
  });

  it('documents the six-partition request-queue topic', () => {
    const topics = fs.readFileSync(path.join(infraDir, 'kafka-topics.md'), 'utf8');
    expect(topics).toContain('--topic request-queue --partitions 6 --replication-factor 3');
  });
});
