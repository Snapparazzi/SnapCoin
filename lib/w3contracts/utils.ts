import {ICOState, TokenReservation, TokenGroup} from 'contracts';

export function tokenGroupIdToName(group: any): TokenGroup {
    const groupId = parseInt(group);
    switch (groupId) {
        case TokenReservation.Team:
            return 'team';
        case TokenReservation.Bounty:
            return 'bounty';
        case TokenReservation.Reserve:
            return 'reserve';
        case TokenReservation.Partners:
          return 'partners';
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
        case 'partners':
          return TokenReservation.Partners;
        default:
            throw new Error(`Unknown token group: ${group}`);
    }
}

export function toIcoStateIdToName(val: BigNumber.BigNumber): string {
    switch (val.toNumber()) {
        case ICOState.Inactive:
            return 'Inactive';
        case ICOState.Active:
            return 'Active';
        case ICOState.Suspended:
            return 'Suspended';
        case ICOState.Terminated:
            return 'Terminated';
        case ICOState.NotCompleted:
            return 'NotCompleted';
        case ICOState.Completed:
            return 'Completed';
        default:
            throw new Error(`Unknown ico state: ${val}`);
    }
}
