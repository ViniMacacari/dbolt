import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';

import { InternalApiService } from './internal-api.service';
import { InternalSessionTokenService } from './internal-session-token.service';

describe('InternalApiService', () => {
  let service: InternalApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: {} },
        {
          provide: InternalSessionTokenService,
          useValue: {
            getSession: () => Promise.resolve({
              baseUrl: 'http://127.0.0.1:47953',
              token: 'test-token',
              tokenHeader: 'x-dbolt-session-token'
            })
          }
        }
      ]
    });
    service = TestBed.inject(InternalApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('parses newline-delimited events split across response chunks', async () => {
    const encoder = new TextEncoder();
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"progress","stage":"analyzing'));
        controller.enqueue(encoder.encode('-request"}\n{"type":"result","data":{"message":"Done","model":"test"}}\n'));
        controller.close();
      }
    });
    spyOn(window, 'fetch').and.resolveTo(new Response(responseBody, { status: 200 }));
    const events: Array<Record<string, unknown>> = [];

    await service.postStream<Record<string, unknown>>('/api/ai-assistant/chat/stream', {}, (event) => {
      events.push(event);
    });

    expect(events).toEqual([
      { type: 'progress', stage: 'analyzing-request' },
      { type: 'result', data: { message: 'Done', model: 'test' } }
    ]);
  });

  it('keeps the API failure details so callers can recognise a lost connection', async () => {
    spyOn(window, 'fetch').and.resolveTo(new Response(
      JSON.stringify({
        success: false,
        message: 'Connection terminated unexpectedly',
        code: 'ECONNRESET',
        sqlState: null
      }),
      { status: 500 }
    ));

    await expectAsync(
      service.postWithSignal('/api/Postgres/v9/query', {}, new AbortController().signal)
    ).toBeRejectedWith(jasmine.objectContaining({
      success: false,
      message: 'Connection terminated unexpectedly',
      error: 'Connection terminated unexpectedly',
      code: 'ECONNRESET'
    }));
  });

  it('rethrows an aborted request untouched so it is not reported as a query failure', async () => {
    const abortController = new AbortController();
    spyOn(window, 'fetch').and.rejectWith(new DOMException('Aborted', 'AbortError'));

    await expectAsync(
      service.postWithSignal('/api/Postgres/v9/query', {}, abortController.signal)
    ).toBeRejectedWith(jasmine.any(DOMException));
  });
});
