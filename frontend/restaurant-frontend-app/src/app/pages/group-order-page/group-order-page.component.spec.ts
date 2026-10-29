import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { GroupOrderPageComponent } from './group-order-page.component';

const caesar = { id: 'dish1', name: 'Caesar Salad', price: 180 };
const tomYum = { id: 'dish2', name: 'Tom Yum', price: 220 };

const SESSIONS: GroupSessionsResponse = {
  participants: [
    {
      id: 'owner',
      type: 'Owner',
      name: 'Yevhenii',
      isSubmitted: true,
      total: 180,
      items: [{ dish: caesar, quantity: 1 }],
    },
    {
      id: 'andrii',
      type: 'Guest',
      name: 'Andrii',
      isSubmitted: true,
      total: 360,
      items: [{ dish: caesar, quantity: 2 }],
    },
    {
      id: 'olena',
      type: 'Guest',
      name: 'Olena',
      isSubmitted: false,
      total: 220,
      items: [{ dish: tomYum, quantity: 1 }],
    },
  ],
  total: 760,
};
const INVITE = {
  GroupReservationId: 'grp-1',
  LocationAddress: 'Rustaveli Avenue 48',
  MaxGuestCount: 5,
  StartTime: '2026-10-21T16:00:00Z',
  EndTime: '2026-10-21T17:30:00Z',
} as GuestInvite;

function buttonByText(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text
  ) as HTMLButtonElement | undefined;
}

describe('GroupOrderPageComponent · Level 2', () => {
  let service: jasmine.SpyObj<GroupOrdersService>;

  function create() {
    TestBed.configureTestingModule({
      imports: [GroupOrderPageComponent],
      providers: [
        { provide: GroupOrdersService, useValue: service },
        {
          provide: ToastService,
          useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']),
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ reservationId: 'res-1' }) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(GroupOrderPageComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    service = jasmine.createSpyObj<GroupOrdersService>('GroupOrdersService', [
      'getGroupInvite$',
      'getSessions$',
      'getOwnerSessionId$',
      'getStatus$',
      'submit$',
    ]);
    service.getGroupInvite$.and.returnValue(of(INVITE));
    service.getSessions$.and.returnValue(of(structuredClone(SESSIONS)));
    service.getOwnerSessionId$.and.returnValue(of('owner'));
    service.getStatus$.and.returnValue(
      of({ currentParticipants: 3, maxCapacity: 5, status: 'Open' as const })
    );
  });

  it('loads the invite by reservation ID and uses its group ID to load sessions', () => {
    create();
    expect(service.getGroupInvite$).toHaveBeenCalledWith('res-1');
    expect(service.getSessions$.calls.mostRecent().args[0]).toBe('grp-1');
  });

  it('shows all participants and labels the owner card My Pre-Order', () => {
    const { element } = create();
    expect(element.querySelectorAll('app-participant-card').length).toBe(3);
    expect(element.textContent).toContain('My Pre-Order');
    expect(element.textContent).toContain('Guest: Andrii');
  });

  it('shows the collecting status badge', () => {
    expect(create().element.textContent).toContain('Collecting pre-orders');
  });

  it('calculates the grand total from confirmed carts only', () => {
    const text = create().element.textContent ?? '';
    expect(text).toContain('$540.00');
    expect(text).not.toContain('$760.00');
  });

  it('consolidates duplicate dishes into one row', () => {
    expect(create().element.textContent).toContain('Caesar Salad × 3');
  });

  it('shows a banner for participants who have not submitted', () => {
    expect(create().element.textContent).toMatch(/1 participant hasn.t submitted/);
  });

  it('shows an empty message when no participants have dishes', () => {
    const empty = structuredClone(SESSIONS);
    empty.participants.forEach((participant) => (participant.items = []));
    service.getSessions$.and.returnValue(of(empty));
    expect(create().element.textContent).toMatch(/Participants haven.t added any dishes yet/);
  });

  it('shows the not-found message when the invite returns 404', () => {
    service.getGroupInvite$.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 404 }))
    );
    expect(create().element.textContent).toContain('Group reservation not found');
  });

  it('retries the load when Try again is clicked', () => {
    service.getGroupInvite$.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 500 }))
    );
    const { fixture, element } = create();
    buttonByText(element, 'Try again')?.click();
    fixture.detectChanges();
    expect(service.getGroupInvite$).toHaveBeenCalledTimes(2);
  });

  it('disables submission if no confirmed participant has dishes', () => {
    const nobodySubmitted = structuredClone(SESSIONS);
    nobodySubmitted.participants.forEach((participant) => (participant.isSubmitted = false));
    service.getSessions$.and.returnValue(of(nobodySubmitted));
    expect(buttonByText(create().element, 'Submit Pre-Order')?.disabled).toBeTrue();
  });

  it('submits once despite a double click while the request is pending', () => {
    const response$ = new Subject<{ dishId: string; quantity: number }[]>();
    service.submit$.and.returnValue(response$);
    const { fixture, element } = create();

    buttonByText(element, 'Submit Pre-Order')?.click();
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]');
    expect(dialog).withContext('confirmation modal should open').not.toBeNull();

    buttonByText(dialog!, 'Submit')?.click();
    fixture.detectChanges();
    buttonByText(dialog!, 'Submit')?.click();
    buttonByText(dialog!, 'Submitting…')?.click();
    fixture.detectChanges();
    expect(service.submit$).toHaveBeenCalledOnceWith('grp-1', 'res-1');
  });

  it('switches to read-only status after a successful submit', () => {
    service.submit$.and.returnValue(of([{ dishId: 'dish1', quantity: 3 }]));
    const { fixture, element } = create();
    buttonByText(element, 'Submit Pre-Order')?.click();
    fixture.detectChanges();
    buttonByText(element.querySelector('[role="dialog"]')!, 'Submit')?.click();
    fixture.detectChanges();

    expect(element.textContent).toContain('Sent to Restaurant');
    expect(buttonByText(element, 'Submit Pre-Order')).toBeUndefined();
  });

  it('keeps the page usable and re-enables submission after a failed submit', () => {
    service.submit$.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
    const { fixture, element } = create();
    buttonByText(element, 'Submit Pre-Order')?.click();
    fixture.detectChanges();
    buttonByText(element.querySelector('[role="dialog"]')!, 'Submit')?.click();
    fixture.detectChanges();

    expect(buttonByText(element, 'Submit Pre-Order')?.disabled).toBeFalse();
  });
});
