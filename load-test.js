import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '1m', target: 500 },
    { duration: '30s', target: 1000 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<8000'],
    http_req_failed: ['rate<0.05'],
  },
};

const TOPICS = [
  'why cats stare at walls',
  'how to make money online',
  'elon musk daily routine',
  'never give up motivation',
  'how to learn coding fast',
  'signs you are smart',
  'what happens when you die',
  'secret habits of billionaires',
];

function getTopic() {
  return TOPICS[Math.floor(Math.random() * TOPICS.length)];
}

export default function () {
  const topic = getTopic();
  const styles = ['Curiosity', 'Shock', 'Authority', 'Story'].slice(0, Math.floor(Math.random() * 4) + 1);

  const payload = JSON.stringify({ topic, styles });
  const res = http.post('http://localhost:3000/api/generate', payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '60s',
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has hooks': (r) => r.body.includes('text'),
  });

  sleep(Math.random() * 3 + 1);
}
