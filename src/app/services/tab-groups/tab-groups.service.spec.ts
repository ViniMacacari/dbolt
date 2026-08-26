import { TestBed } from '@angular/core/testing';

import { TabGroup, TabGroupsService, TabLayoutDescriptor } from './tab-groups.service';

describe('TabGroupsService', () => {
  let service: TabGroupsService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TabGroupsService] });
    service = TestBed.inject(TabGroupsService);
  });

  function tab(name: string, groupId: string | null = null): any {
    return { name, layoutKey: name, groupId };
  }

  function group(id: string, collapsed = false): TabGroup {
    return { id, name: id, colorId: 'blue', collapsed };
  }

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('gives each new group a color that is not in use yet', () => {
    const groups: TabGroup[] = [];
    const first = service.createGroup(groups, 'A');
    groups.push(first);
    const second = service.createGroup(groups, 'B');

    expect(second.colorId).not.toBe(first.colorId);
  });

  it('builds a chip before the first tab of each group', () => {
    const groups = [group('g1')];
    const tabs = [tab('a', 'g1'), tab('b', 'g1'), tab('c')];

    const layout = service.buildLayout(tabs, groups, 1);

    expect(layout.map((item) => item.kind)).toEqual(['group', 'tab', 'tab', 'tab']);
    expect(layout[0]).toEqual(jasmine.objectContaining({ kind: 'group', tabCount: 2, hasActiveTab: true }));
  });

  it('hides the tabs of a collapsed group but keeps its chip', () => {
    const groups = [group('g1', true)];
    const tabs = [tab('a', 'g1'), tab('b', 'g1'), tab('c')];

    const layout = service.buildLayout(tabs, groups, null);

    expect(layout.length).toBe(2);
    expect(layout[0].kind).toBe('group');
    expect(layout[1]).toEqual(jasmine.objectContaining({ kind: 'tab', tab: tabs[2] }));
  });

  it('keeps the tabs of a collapsed group rendered while it animates', () => {
    const collapsing = { ...group('g1', true), animating: true };
    const tabs = [tab('a', 'g1'), tab('b', 'g1')];

    const layout = service.buildLayout(tabs, [collapsing], 0);

    expect(layout.map((item) => item.kind)).toEqual(['group', 'tab', 'tab']);
  });

  it('ignores a group id that no longer exists', () => {
    const tabs = [tab('a', 'removed')];

    const layout = service.buildLayout(tabs, [], 0);

    expect(layout.map((item) => item.kind)).toEqual(['tab']);
  });

  it('moves a tab next to the other tabs of the group it joins', () => {
    const groups = [group('g1')];
    const tabs = [tab('a', 'g1'), tab('b'), tab('c')];

    const ordered = service.assignTab(tabs, groups, tabs[2], 'g1');

    expect(ordered.map((item) => item.name)).toEqual(['a', 'c', 'b']);
    expect(ordered[1].groupId).toBe('g1');
  });

  it('keeps a removed tab right after the group it left', () => {
    const groups = [group('g1')];
    const tabs = [tab('a', 'g1'), tab('b', 'g1'), tab('c', 'g1'), tab('d')];

    const ordered = service.assignTab(tabs, groups, tabs[0], null);

    expect(ordered.map((item) => item.name)).toEqual(['b', 'c', 'a', 'd']);
    expect(ordered[2].groupId).toBeNull();
  });

  it('keeps the tabs of a group contiguous', () => {
    const groups = [group('g1')];
    const tabs = [tab('a', 'g1'), tab('b'), tab('c', 'g1')];

    const ordered = service.normalizeOrder(tabs, groups);

    expect(ordered.map((item) => item.name)).toEqual(['a', 'c', 'b']);
  });

  it('resolves the drop target from the item that precedes the dragged tab', () => {
    const groups = [group('g1')];
    const tabs = [tab('a', 'g1'), tab('b')];

    expect(service.resolveDropGroupId(tabs, groups, null)).toBeNull();
    expect(service.resolveDropGroupId(tabs, groups, { kind: 'group', key: 'g1' })).toBe('g1');
    expect(service.resolveDropGroupId(tabs, groups, { kind: 'tab', key: 'a' })).toBe('g1');
    expect(service.resolveDropGroupId(tabs, groups, { kind: 'tab', key: 'b' })).toBeNull();
  });

  it('rebuilds the order from the rendered layout after a drag', () => {
    const groups = [group('g1')];
    const tabs = [tab('a', 'g1'), tab('b', 'g1'), tab('c')];
    tabs[2].groupId = 'g1';

    const layout: TabLayoutDescriptor[] = [
      { kind: 'group', key: 'g1' },
      { kind: 'tab', key: 'c' },
      { kind: 'tab', key: 'a' },
      { kind: 'tab', key: 'b' }
    ];

    const ordered = service.buildOrderFromLayout(tabs, groups, layout);

    expect(ordered.map((item) => item.name)).toEqual(['c', 'a', 'b']);
  });

  it('keeps a collapsed group in place when another tab is dragged', () => {
    const groups = [group('g1', true)];
    const tabs = [tab('a', 'g1'), tab('b', 'g1'), tab('c'), tab('d')];

    const layout: TabLayoutDescriptor[] = [
      { kind: 'tab', key: 'd' },
      { kind: 'group', key: 'g1' },
      { kind: 'tab', key: 'c' }
    ];

    const ordered = service.buildOrderFromLayout(tabs, groups, layout);

    expect(ordered.map((item) => item.name)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('drops groups that no longer have tabs', () => {
    const groups = [group('g1'), group('g2')];
    const tabs = [tab('a', 'g1')];

    expect(service.removeEmptyGroups(tabs, groups).map((item) => item.id)).toEqual(['g1']);
  });
});
