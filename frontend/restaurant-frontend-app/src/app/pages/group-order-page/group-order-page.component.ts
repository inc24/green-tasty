import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { GROUP_ORDER_PREVIEW } from '@app/shared/mocks/group-orders/group-order.preview';
import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';

@Component({
  selector: 'app-group-order-page',
  imports: [CurrencyPipe, ParticipantCardComponent],
  templateUrl: './group-order-page.component.html',
  styleUrl: './group-order-page.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GroupOrderPageComponent {
  // поки що статичні дані; на рівні 2 їх замінить відповідь API
  readonly participants = signal(GROUP_ORDER_PREVIEW.sessions.participants);
  readonly invite = signal(GROUP_ORDER_PREVIEW.invite);

  readonly submittedGuestNames = computed(() =>
    this.participants()
      .filter((person) => person.type === 'Guest' && person.isSubmitted)
      .map((person) => person.name),
  );
  readonly grandTotal = computed(() =>
    this.participants().reduce((total, person) => total + person.total, 0),
  );

  readonly header = computed(() => {
    const invite = this.invite();
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
}
