import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { GroupOrdersService } from './group-orders.service';

const BASE_URL = 'https://api.test';

describe('GroupOrdersService', () => {
  let service: GroupOrdersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: BASE_URL },
      ],
    });
    service = TestBed.inject(GroupOrdersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('gets the invite token and then loads the invite', () => {
    let groupId = '';
    service.getGroupInvite$('res-1').subscribe((invite) => (groupId = invite.GroupReservationId));

    http.expectOne(`${BASE_URL}/reservations/res-1/invite-token`).flush({ token: 'tok' });
    http.expectOne(`${BASE_URL}/guest/invites/tok`).flush({ GroupReservationId: 'grp-1' });

    expect(groupId).toBe('grp-1');
  });

  it('gets group sessions', () => {
    service.getSessions$('grp-1').subscribe();
    const request = http.expectOne(`${BASE_URL}/guest/groups/grp-1/sessions`);
    expect(request.request.method).toBe('GET');
    request.flush({ participants: [], total: 0 });
  });

  it('returns the owner session ID', () => {
    let sessionId = '';
    service.getOwnerSessionId$('res-1').subscribe((id) => (sessionId = id));
    const request = http.expectOne(`${BASE_URL}/reservations/res-1/guest-session-id`);
    expect(request.request.method).toBe('GET');
    request.flush({ guestSessionId: 'owner-1' });
    expect(sessionId).toBe('owner-1');
  });

  it('gets the group status', () => {
    service.getStatus$('grp-1').subscribe();
    const request = http.expectOne(`${BASE_URL}/guest/groups/grp-1/status`);
    expect(request.request.method).toBe('GET');
    request.flush({ currentParticipants: 3, maxCapacity: 5, status: 'Open' });
  });

  it('submits the group reservation with the reservation ID', () => {
    service.submit$('grp-1', 'res-1').subscribe();
    const request = http.expectOne(`${BASE_URL}/group-reservations/grp-1/submit`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reservationId: 'res-1' });
    request.flush([]);
  });
});
