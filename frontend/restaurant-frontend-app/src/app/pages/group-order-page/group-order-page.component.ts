import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, map, switchMap } from 'rxjs';
import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';
import { Participant } from '@app/models/group-orders/participant.model';
import { GroupReservationStatus } from '@app/models/group-orders/group-status.model';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';
import { consolidatePreOrder } from '@app/shared/helpers/consolidate-pre-order';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';

@Component({
  selector: 'app-group-order-page',
  imports: [CurrencyPipe, ParticipantCardComponent, ModalComponent],
  templateUrl: './group-order-page.component.html',
  styleUrl: './group-order-page.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GroupOrderPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly groupOrdersService = inject(GroupOrdersService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly participants = signal<Participant[]>([]);
  readonly invite = signal<GuestInvite | null>(null);
  readonly guestSessionId = signal('');
  readonly status = signal<GroupReservationStatus | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly isSubmitting = signal(false);
  readonly showSubmitDialog = signal(false);

  readonly consolidatedOrder = computed(() => consolidatePreOrder(this.participants()));
  readonly grandTotal = computed(() => this.consolidatedOrder().total);
  readonly unsubmittedCount = computed(
    () => this.participants().filter((participant) => !participant.isSubmitted).length
  );
  readonly hasNoDishes = computed(() =>
    this.participants().every((participant) => participant.items.length === 0)
  );
  readonly isReadOnly = computed(() => this.status() !== 'Open');
  readonly canSubmit = computed(
    () =>
      this.status() === 'Open' && this.consolidatedOrder().items.length > 0 && !this.isSubmitting()
  );

  readonly header = computed(() => {
    const invite = this.invite();
    if (!invite) {
      return null;
    }

    const startTime = new Date(invite.StartTime);
    const endTime = new Date(invite.EndTime);
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    });

    return {
      address: invite.LocationAddress,
      date: new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(startTime),
      startDateTime: invite.StartTime,
      endDateTime: invite.EndTime,
      startTime: timeFormatter.format(startTime),
      endTime: timeFormatter.format(endTime),
      participantCount: this.participants().length,
      maxGuestCount: invite.MaxGuestCount,
    };
  });

  readonly statusLabel = computed(() => {
    switch (this.status()) {
      case 'Open':
        return 'Collecting pre-orders';
      case 'Submitted':
        return 'Sent to Restaurant';
      case 'Closed':
        return 'Closed';
      default:
        return '';
    }
  });

  constructor() {
    this.load();
  }

  load(): void {
    const reservationId = this.route.snapshot.paramMap.get('reservationId');
    this.loading.set(true);
    this.errorMessage.set('');

    if (!reservationId) {
      this.loading.set(false);
      this.errorMessage.set('Group reservation not found');
      return;
    }

    forkJoin({
      invite: this.groupOrdersService.getGroupInvite$(reservationId),
      guestSessionId: this.groupOrdersService.getOwnerSessionId$(reservationId),
    })
      .pipe(
        switchMap(({ invite, guestSessionId }) =>
          forkJoin({
            sessions: this.groupOrdersService.getSessions$(invite.GroupReservationId),
            status: this.groupOrdersService.getStatus$(invite.GroupReservationId),
          }).pipe(map(({ sessions, status }) => ({ invite, guestSessionId, sessions, status })))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ invite, guestSessionId, sessions, status }) => {
          this.invite.set(invite);
          this.guestSessionId.set(guestSessionId);
          this.participants.set(sessions.participants);
          this.status.set(status.status);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(
            error instanceof HttpErrorResponse && error.status === 404
              ? 'Group reservation not found'
              : 'Unable to load group order. Please try again.'
          );
        },
      });
  }

  openSubmitDialog(): void {
    if (this.canSubmit()) {
      this.showSubmitDialog.set(true);
    }
  }

  closeSubmitDialog(): void {
    if (!this.isSubmitting()) {
      this.showSubmitDialog.set(false);
    }
  }

  submit(): void {
    const invite = this.invite();
    const reservationId = this.route.snapshot.paramMap.get('reservationId');
    if (!invite || !reservationId || !this.canSubmit()) {
      return;
    }

    this.isSubmitting.set(true);
    this.groupOrdersService
      .submit$(invite.GroupReservationId, reservationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.status.set('Submitted');
          this.showSubmitDialog.set(false);
          this.isSubmitting.set(false);
          this.toastService.success('Pre-order sent to the restaurant');
        },
        error: () => {
          this.isSubmitting.set(false);
        },
      });
  }
}
