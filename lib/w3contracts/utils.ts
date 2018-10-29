import {TokenReservation, TokenGroup} from 'contracts';

export function tokenGroupIdToName(group: any): TokenGroup {
    const groupId = parseInt(group);
    switch (groupId) {
        case TokenReservation.Team:
            return 'team';
        case TokenReservation.Bounty:
            return 'bounty';
        case TokenReservation.Reserve:
            return 'reserve';
        case TokenReservation.Advisors:
          return 'advisors';
        case TokenReservation.StackingBonus:
            return 'stackingBonus';
        default:
            throw new Error(`Unknown token groupId: ${group}`);
    }
}

export function tokenGroupToId(group: TokenGroup): number {
    switch (group) {
        case 'team':
            return TokenReservation.Team;
        case 'bounty':
            return TokenReservation.Bounty;
        case 'reserve':
            return TokenReservation.Reserve;
        case 'advisors':
          return TokenReservation.Advisors;
        case 'stackingBonus':
            return TokenReservation.StackingBonus;
        default:
            throw new Error(`Unknown token group: ${group}`);
    }
}