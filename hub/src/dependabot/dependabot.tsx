import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import { BuildRestClient } from "azure-devops-extension-api/Build";
import { Page } from "azure-devops-ui/Page";
import { ZeroData } from "azure-devops-ui/ZeroData";
import * as React from "react";
import * as ReactDOM from "react-dom";

import "./dependabot.scss";

import { Header, TitleSize } from "azure-devops-ui/Header";

import { showRootComponent } from "../Common";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";
import { Card } from "azure-devops-ui/Card";
import { Table } from "azure-devops-ui/Table";

import {
    ColumnMore,
    ColumnSelect,
    ISimpleTableCell,
    renderSimpleCell,
    TableColumnLayout,
} from "azure-devops-ui/Table";
import { ObservableValue } from "azure-devops-ui/Core/Observable";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";
import { IHeaderCommandBarItem } from "azure-devops-ui/HeaderCommandBar";

import { FilterBar } from "azure-devops-ui/FilterBar";
import { Observer } from "azure-devops-ui/Observer";
import { KeywordFilterBarItem } from "azure-devops-ui/TextFilterBarItem";
import { Filter, FILTER_CHANGE_EVENT, FilterOperatorType } from "azure-devops-ui/Utilities/Filter";
import {
    DropdownSelection,
    DropdownMultiSelection
} from "azure-devops-ui/Utilities/DropdownSelection";
import { DropdownFilterBarItem } from "azure-devops-ui/Dropdown";

interface ITableItem extends ISimpleTableCell {
    name: string;
    version: string;
    type: string;
    referencedBy: string;
}

const fixedColumns = [
    {
        columnLayout: TableColumnLayout.singleLinePrefix,
        id: "name",
        name: "Dependency Name",
        readonly: true,
        renderCell: renderSimpleCell,
        width: new ObservableValue(-30),
    },
    {
        id: "version",
        name: "Version",
        readonly: true,
        renderCell: renderSimpleCell,
        width: new ObservableValue(-10),
    },
    {
        columnLayout: TableColumnLayout.none,
        id: "type",
        name: "Type",
        readonly: true,
        renderCell: renderSimpleCell,
        width: new ObservableValue(-10),
    },
    {
        columnLayout: TableColumnLayout.none,
        id: "securityAdvisories",
        name: "Security Advisories",
        readonly: true,
        renderCell: renderSimpleCell,
        width: new ObservableValue(-30),
    },
    {
        columnLayout: TableColumnLayout.none,
        id: "referencedBy",
        name: "Referenced By Project(s)",
        readonly: true,
        renderCell: renderSimpleCell,
        width: new ObservableValue(-50),
    },
];

const dependencyList = {
    "dependencies": [
      {
        "name": "Microsoft.Extensions.Configuration.Binder",
        "requirements": [],
        "version": "8.0.0",
        "security-advisories": [],
      },
      {
        "name": "Microsoft.Extensions.DependencyModel",
        "requirements": [],
        "version": "8.0.0",
        "security-advisories": [],
      },
      {
        "name": "Microsoft.Extensions.Logging.Abstractions",
        "requirements": [],
        "version": "8.0.0",
        "security-advisories": [],
      },
      {
        "name": "Microsoft.Extensions.Options",
        "requirements": [],
        "version": "8.0.0",
        "security-advisories": [],
      },
      {
        "name": "Serilog",
        "requirements": [],
        "version": "3.1.1",
        "security-advisories": [],
      },
      {
        "name": "Serilog.AspNetCore",
        "requirements": [
          {
            "file": "/WebApplicationNetCore/WebApplicationNetCore.csproj",
            "groups": ["dependencies"],
            "requirement": "8.0.1",
            "source": null
          }
        ],
        "version": "8.0.1",
        "security-advisories": [],
      },
      {
        "name": "Serilog.Extensions.Hosting",
        "requirements": [],
        "version": "8.0.0",
        "security-advisories": [],
      },
      {
        "name": "Serilog.Extensions.Logging",
        "requirements": [],
        "version": "8.0.0",
        "security-advisories": [],
      },
      {
        "name": "Serilog.Formatting.Compact",
        "requirements": [],
        "version": "2.0.0",
        "security-advisories": [],
      },
      {
        "name": "Serilog.Settings.Configuration",
        "requirements": [],
        "version": "8.0.0",
        "security-advisories": [],
      },
      {
        "name": "Serilog.Sinks.Console",
        "requirements": [],
        "version": "5.0.0",
        "security-advisories": [],
      },
      {
        "name": "Serilog.Sinks.Debug",
        "requirements": [],
        "version": "2.0.0",
        "security-advisories": [],
      },
      {
        "name": "Serilog.Sinks.File",
        "requirements": [],
        "version": "5.0.0",
        "security-advisories": [],
      },
      {
        "name": "System.Text.Json",
        "requirements": [],
        "version": "8.0.0",
        "security-advisories": [
            {
                "id": "CVE-2021-40444",
                "description": "System.Text.Json could allow a remote attacker to execute arbitrary code on the system, caused by improper handling of objects in memory. By persuading a victim to open a specially-crafted file, an attacker could exploit this vulnerability to execute arbitrary code on the system."
            }
        ]
      }
    ],
    "dependency_files": ["/WebApplicationNetCore/WebApplicationNetCore.csproj", "/WebApplicationNetCore/nuget.config"]
  };  

 const tableItemsNoIcons = new ArrayItemProvider<ITableItem>(
    JSON.parse(JSON.stringify(dependencyList.dependencies)).map(x => {
        return {
            name: x.name,
            version: x.version,
            type: x.requirements.length > 0 ? "Top-Level" : "Transitive",
            securityAdvisories: x["security-advisories"] ? x["security-advisories"].map(a => a.id).join(", ") : "-",
            referencedBy: x.requirements?.map(r => r?.file).join(", ")
        }
    })
);

export const commandBarItemsSimple: IHeaderCommandBarItem[] = [
    {
        iconProps: {
            iconName: "Download"
        },
        id: "testCreate",
        important: true,
        onActivate: () => {
            alert("This would normally trigger a modal popup");
        },
        text: "Download",
        tooltipProps: {
            text: "Custom tooltip for create"
        },

    },
    {
        iconProps: {
            iconName: "DownloadDocument"
        },
        id: "testCreate",
        important: true,
        isPrimary: true,
        onActivate: () => {
            alert("This would normally trigger a modal popup");
        },
        text: "Generate SBOM",
        tooltipProps: {
            text: "Custom tooltip for create"
        },

    },
    {
        iconProps: {
            iconName: "Delete"
        },
        id: "testDelete",
        important: false,
        onActivate: () => {
            alert("submenu clicked");
        },
        text: "Menu row with delete icon"
    },
    {
        iconProps: {
            iconName: "Share"
        },
        id: "testShare",
        important: false,
        onActivate: () => {
            alert("submenu clicked");
        },
        text: "Menu row with share icon"
    }
];

class DependencyList extends React.Component<{}, { artifactContext?: string, debugInfo?: string }> {
    constructor(props: {}) {
        super(props);
        this.state = { artifactContext: undefined, debugInfo: undefined };
    }

    public async componentDidMount() {
        await SDK.init();
        const projectName = "Dependabot";
        const buildId = 388;
        const artifactName = "update-0-nuget-all-dependency-list.json";

        try {
            const buildClient = await getClient(BuildRestClient);
            const artifact = await buildClient.getArtifactContentZip(projectName, buildId, artifactName);
            if (artifact) {
                this.setState({
                    artifactContext: JSON.stringify(artifact, null, 2),
                    debugInfo: "Artifact was successfully retrieved."
                });
            } else {
                this.setState({
                    artifactContext: "No artifact was returned.",
                    debugInfo: "No artifact found with the specified name."
                });
            }
        } catch (error) {
            console.error("Error fetching artifact:", error);
            this.setState({
                artifactContext: `Error fetching artifact: ${error}`,
                debugInfo: `API call failed: ${error}`
            });
        }
    }

    public render(): JSX.Element {
        const { artifactContext, debugInfo } = this.state;

        return (
            <div className="dependabot flex-grow">
                <Table
                    ariaLabel="Basic Table"
                    columns={fixedColumns}
                    itemProvider={tableItemsNoIcons}
                    role="table"
                    className="table-example"
                    containerClassName="h-scroll-auto"
                />
                {!artifactContext && (
                    <ZeroData
                        primaryText="Fetching artifact..."
                        secondaryText={"Please wait while the artifact is being fetched."}
                        imageAltText=""
                    />
                )}
                {artifactContext && (
                     <div>
                        <h3>Artifact Information:</h3>
                        <pre>{artifactContext}</pre>
                    </div>
                )}
                {debugInfo && (
                    <div>
                        <h3>Debug Information:</h3>
                        <pre>{debugInfo}</pre>
                    </div>
                )}
            </div>
        );
    }
}

export const singleListItems = [
    "Item 1",
    "Item 2",
    "Item 3",
    "Really really really really really really really really really really really really really long item"
];

export const multiListItems = [
    "Item 4",
    "Item 5",
    "Item 6",
    "Item 14",
    "Item 15",
    "Item 16",
    "Item 24",
    "Item 25",
    "Item 26",
    "Really really really really really really really really really really really really really long item"
];

interface IDependabotHub { 
    projectContext: any;
}

class DependabotHub extends React.Component<{}, IDependabotHub> {   

    private filter: Filter;
    private currentState = new ObservableValue("");
    private selectionSingleList = new DropdownSelection();
    private selectionMultiList = new DropdownMultiSelection();
    private selectionEmptyList = new DropdownMultiSelection();

    constructor(props: {}) {
        super(props);
        this.state = { projectContext: undefined };  
        this.filter = new Filter();
        this.filter.setFilterItemState("listMulti", {
            value: [],
            operator: FilterOperatorType.and
        });
        this.filter.subscribe(() => {
            this.currentState.value = JSON.stringify(this.filter.getState(), null, 4);
        }, FILTER_CHANGE_EVENT);
    }

    public componentDidMount() {
        try {        
            console.log("Component did mount, initializing SDK...");
            SDK.init();
            
            SDK.ready().then(() => {
                console.log("SDK is ready, loading project context...");
                this.loadProjectContext();
            }).catch((error) => {
                console.error("SDK ready failed: ", error);
            });
        } catch (error) {
            console.error("Error during SDK initialization or project context loading: ", error);
        }
    }

    public render(): JSX.Element {
        return (
            <Page className="dependabot-hub flex-grow">
                <Header
                    title={"Dependabot - Dependency Graph"}
                    commandBarItems={commandBarItemsSimple}
                    titleSize={TitleSize.Medium}
                    titleIconProps={{ iconName: "OpenSource" }}
                    titleAriaLevel={3}
                />
                <div className="page-content page-content-top">
                <div className="flex-grow">
                            <FilterBar filter={this.filter}>
                                <KeywordFilterBarItem filterItemKey="Placeholder" />

                                <DropdownFilterBarItem
                                    filterItemKey="listSingle"
                                    filter={this.filter}
                                    items={singleListItems.map(i => {
                                        return {
                                            id: i,
                                            text: i,
                                            iconProps: { iconName: "Home" }
                                        };
                                    })}
                                    selection={this.selectionSingleList}
                                    placeholder="Project"
                                />

                                <DropdownFilterBarItem
                                    filterItemKey="listMulti"
                                    filter={this.filter}
                                    items={multiListItems.map(i => {
                                        return {
                                            id: i,
                                            text: i,
                                        };
                                    })}
                                    selection={this.selectionMultiList}
                                    placeholder="Repository"
                                />

                                <DropdownFilterBarItem
                                    filterItemKey="listMultiEmpty"
                                    filter={this.filter}
                                    items={[]}
                                    selection={this.selectionEmptyList}
                                    placeholder="Dependency File"
                                    noItemsText="No items found"
                                />
                            </FilterBar>
                        </div>
                    <Card>
                        
                        <DependencyList>
                        </DependencyList>
                    </Card>
                </div>
            </Page>
        );
    }   

    private async loadProjectContext(): Promise<void> {
        try {            
            const client = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
            const context = await client.getProject();
            
            this.setState({ projectContext: context });            

            SDK.notifyLoadSucceeded();
        } catch (error) {
            console.error("Failed to load project context: ", error);
        }
    }
}

showRootComponent(<DependabotHub />);
